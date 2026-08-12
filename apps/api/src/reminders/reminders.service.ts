/* Post-sale plan, reminder-instance and customer-activity authority. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type {
  CustomerActivityRequest,
  ReminderListQuery,
  ReminderRuleRequest,
  RecordReminderConsentRequest,
  RescheduleReminderRequest,
  UpdateReminderPreferencesRequest,
  UpdateVehicleReminderDetailsRequest,
} from '@gdm/contracts';
import { REMINDER_TYPES } from '@gdm/contracts';
import { messageTemplateVariableKeys } from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import type { Queue } from 'bullmq';
import { and, asc, desc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import {
  authorizationScopeCondition,
  pageMetadata,
  pageOffset,
} from '../authorization/authorization-scope.sql.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import {
  BULLMQ_QUEUE_FACTORY,
  type BullMqQueueFactory,
} from '../infrastructure/redis/redis.tokens.js';
import { MessagingService } from '../messaging/messaging.service.js';
import { Inject } from '@nestjs/common';
import { PLATFORM_BACKGROUND_QUEUE } from '../background/background-processing.lifecycle.js';

type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];
type Vehicle = typeof schema.customerVehicles.$inferSelect;
type Rule = typeof schema.reminderRuleTemplates.$inferSelect;

const labels: Record<(typeof REMINDER_TYPES)[number], string> = {
  AMC_EXPIRY: 'AMC expiry',
  EXCHANGE_ELIGIBILITY: 'Exchange eligibility',
  INSURANCE_EXPIRY: 'Insurance expiry',
  PUC_EXPIRY: 'PUC expiry',
  RC_PENDING: 'RC pending',
  ROADSIDE_ASSISTANCE_EXPIRY: 'Roadside assistance expiry',
  SERVICE_APPOINTMENT: 'Service appointment',
  SERVICE_DUE: 'Service due',
  UPGRADE_OPPORTUNITY: 'Upgrade opportunity',
  WARRANTY_EXPIRY: 'Warranty expiry',
};

function clientId(context: AuthorizationContext): string {
  if (!context.clientOrganizationId)
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  return context.clientOrganizationId;
}
const bad = (code: string, message: string) =>
  new BadRequestException({ code, details: [], message, retryable: false });
const conflict = (code: string, message: string) =>
  new ConflictException({ code, details: [], message, retryable: false });
const missing = (message: string) =>
  new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });

function requiredKey(value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 128)
    throw bad('VALIDATION_ERROR', 'A valid Idempotency-Key header is required.');
  return normalized;
}
function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}
function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}
function dateValue(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

@Injectable()
export class RemindersService {
  private backgroundQueue: Queue | undefined;

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
    @Inject(MessagingService) private readonly messaging: MessagingService,
    @Optional()
    @Inject(BULLMQ_QUEUE_FACTORY)
    private readonly queueFactory?: BullMqQueueFactory,
  ) {}

  async definitions(context: AuthorizationContext) {
    const cid = clientId(context);
    await this.ensureDefinitions(this.connection.db, cid);
    return {
      definitions: await this.connection.db
        .select()
        .from(schema.reminderDefinitions)
        .where(eq(schema.reminderDefinitions.clientOrganizationId, cid))
        .orderBy(asc(schema.reminderDefinitions.displayName)),
    };
  }

  async rules(context: AuthorizationContext) {
    const cid = clientId(context);
    const rows = await this.connection.db
      .select({
        definition: schema.reminderDefinitions,
        rule: schema.reminderRuleTemplates,
        template: schema.messageTemplates,
      })
      .from(schema.reminderRuleTemplates)
      .innerJoin(
        schema.reminderDefinitions,
        and(
          eq(schema.reminderDefinitions.clientOrganizationId, cid),
          eq(schema.reminderDefinitions.id, schema.reminderRuleTemplates.reminderDefinitionId),
        ),
      )
      .innerJoin(
        schema.messageTemplates,
        and(
          eq(schema.messageTemplates.clientOrganizationId, cid),
          eq(schema.messageTemplates.id, schema.reminderRuleTemplates.templateId),
        ),
      )
      .where(eq(schema.reminderRuleTemplates.clientOrganizationId, cid))
      .orderBy(
        asc(schema.reminderDefinitions.displayName),
        desc(schema.reminderRuleTemplates.createdAt),
      );
    return {
      rules: rows.map((row) => ({
        ...row.rule,
        reminder_type: row.definition.type,
        template_name: row.template.name,
        template_status: row.template.status,
      })),
    };
  }

  async createRule(
    context: AuthorizationContext,
    body: ReminderRuleRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const key = requiredKey(idempotencyKey);
    const replay = await this.replay(cid, key, 'CREATE_RULE', body);
    if (replay) return replay;
    const [template] = await this.connection.db
      .select()
      .from(schema.messageTemplates)
      .where(
        and(
          eq(schema.messageTemplates.clientOrganizationId, cid),
          eq(schema.messageTemplates.id, body.template_id),
        ),
      )
      .limit(1);
    if (!template || template.status !== 'APPROVED')
      throw bad('TEMPLATE_NOT_APPROVED', 'Select an approved tenant messaging template.');
    const expectedCategory = body.category === 'MARKETING' ? 'MARKETING' : 'UTILITY';
    if (template.category !== expectedCategory)
      throw bad(
        'TEMPLATE_CATEGORY_MISMATCH',
        `${body.category} reminders require a ${expectedCategory} template.`,
      );
    const response = await this.connection.db.transaction(async (tx) => {
      await this.ensureDefinitions(tx, cid);
      const [definition] = await tx
        .select()
        .from(schema.reminderDefinitions)
        .where(
          and(
            eq(schema.reminderDefinitions.clientOrganizationId, cid),
            eq(schema.reminderDefinitions.type, body.reminder_type),
          ),
        )
        .limit(1);
      if (!definition) throw missing('Reminder definition was not found.');
      const [rule] = await tx
        .insert(schema.reminderRuleTemplates)
        .values({
          active: body.active,
          baseDateField: body.base_date_field,
          brandName: body.brand_name,
          category: body.category,
          channel: body.channel,
          clientOrganizationId: cid,
          createdByMembershipId: context.membershipId,
          dueAfterDays: body.threshold_kind === 'DATE' ? body.due_after_days : null,
          dueKilometres: body.threshold_kind === 'KILOMETRE' ? body.due_kilometres : null,
          modelName: body.model_name,
          modelYear: body.model_year,
          noticeDays: [...new Set(body.notice_days)].sort((a, b) => b - a),
          reminderDefinitionId: definition.id,
          templateId: body.template_id,
          thresholdKind: body.threshold_kind,
          variantName: body.variant_name,
        })
        .returning();
      if (!rule) throw new Error('Reminder rule insert returned no row.');
      await this.audit(tx, context, 'REMINDER_RULE_CREATED', rule.id, correlationId, {
        category: body.category,
        reminder_type: body.reminder_type,
      });
      const result = { id: rule.id, version: rule.version };
      await this.receipt(tx, cid, key, 'CREATE_RULE', body, result);
      return result;
    });
    return response;
  }

  async plans(context: AuthorizationContext, query: ReminderListQuery) {
    const cid = clientId(context);
    const filters = [
      eq(schema.customerReminderPlans.clientOrganizationId, cid),
      authorizationScopeCondition(context, { branch: schema.customerVehicles.branchId }),
    ];
    if (query.branch_id) filters.push(eq(schema.customerVehicles.branchId, query.branch_id));
    if (query.type) filters.push(eq(schema.reminderDefinitions.type, query.type));
    const rows = await this.connection.db
      .select({
        contactName: schema.contacts.displayName,
        definition: schema.reminderDefinitions,
        plan: schema.customerReminderPlans,
        rule: schema.reminderRuleTemplates,
        vehicle: schema.customerVehicles,
      })
      .from(schema.customerReminderPlans)
      .innerJoin(
        schema.customerVehicles,
        and(
          eq(schema.customerVehicles.clientOrganizationId, cid),
          eq(schema.customerVehicles.id, schema.customerReminderPlans.customerVehicleId),
        ),
      )
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.customerVehicles.contactId),
        ),
      )
      .innerJoin(
        schema.reminderRuleTemplates,
        and(
          eq(schema.reminderRuleTemplates.clientOrganizationId, cid),
          eq(schema.reminderRuleTemplates.id, schema.customerReminderPlans.ruleTemplateId),
        ),
      )
      .innerJoin(
        schema.reminderDefinitions,
        and(
          eq(schema.reminderDefinitions.clientOrganizationId, cid),
          eq(schema.reminderDefinitions.id, schema.reminderRuleTemplates.reminderDefinitionId),
        ),
      )
      .where(and(...filters))
      .orderBy(asc(schema.customerReminderPlans.dueAt))
      .limit(query.limit + 1)
      .offset(pageOffset(query.page, query.limit));
    const accessible = rows.filter((row) => this.canAccess(context, row.vehicle));
    return {
      pagination: pageMetadata(query.page, query.limit, accessible.length),
      plans: accessible.slice(0, query.limit).map((row) => this.presentPlan(row)),
    };
  }

  async instances(context: AuthorizationContext, query: ReminderListQuery) {
    const cid = clientId(context);
    const filters = [
      eq(schema.reminderInstances.clientOrganizationId, cid),
      authorizationScopeCondition(context, { branch: schema.customerVehicles.branchId }),
    ];
    if (query.branch_id) filters.push(eq(schema.customerVehicles.branchId, query.branch_id));
    if (query.status) filters.push(eq(schema.reminderInstances.status, query.status));
    if (query.type) filters.push(eq(schema.reminderDefinitions.type, query.type));
    const rows = await this.connection.db
      .select({
        contactName: schema.contacts.displayName,
        definition: schema.reminderDefinitions,
        instance: schema.reminderInstances,
        vehicle: schema.customerVehicles,
      })
      .from(schema.reminderInstances)
      .innerJoin(
        schema.customerReminderPlans,
        and(
          eq(schema.customerReminderPlans.clientOrganizationId, cid),
          eq(schema.customerReminderPlans.id, schema.reminderInstances.customerReminderPlanId),
        ),
      )
      .innerJoin(
        schema.customerVehicles,
        and(
          eq(schema.customerVehicles.clientOrganizationId, cid),
          eq(schema.customerVehicles.id, schema.customerReminderPlans.customerVehicleId),
        ),
      )
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.customerVehicles.contactId),
        ),
      )
      .innerJoin(
        schema.reminderRuleTemplates,
        and(
          eq(schema.reminderRuleTemplates.clientOrganizationId, cid),
          eq(schema.reminderRuleTemplates.id, schema.customerReminderPlans.ruleTemplateId),
        ),
      )
      .innerJoin(
        schema.reminderDefinitions,
        and(
          eq(schema.reminderDefinitions.clientOrganizationId, cid),
          eq(schema.reminderDefinitions.id, schema.reminderRuleTemplates.reminderDefinitionId),
        ),
      )
      .where(and(...filters))
      .orderBy(asc(schema.reminderInstances.scheduledFor))
      .limit(query.limit + 1)
      .offset(pageOffset(query.page, query.limit));
    const accessible = rows.filter((row) => this.canAccess(context, row.vehicle));
    return {
      pagination: pageMetadata(query.page, query.limit, accessible.length),
      reminders: accessible.slice(0, query.limit).map((row) => ({
        ...this.presentInstance(row.instance),
        contact_name: row.contactName,
        reminder_type: row.definition.type,
        vehicle: `${row.vehicle.brandName} ${row.vehicle.modelName} ${row.vehicle.variantName}`,
        vehicle_id: row.vehicle.id,
      })),
    };
  }

  async history(context: AuthorizationContext, instanceId: string) {
    const { instance } = await this.accessibleInstance(context, instanceId);
    const events = await this.connection.db
      .select()
      .from(schema.reminderEvents)
      .where(
        and(
          eq(schema.reminderEvents.clientOrganizationId, clientId(context)),
          eq(schema.reminderEvents.reminderInstanceId, instance.id),
        ),
      )
      .orderBy(asc(schema.reminderEvents.createdAt));
    return { events, reminder: this.presentInstance(instance) };
  }

  async generateForVehicle(
    context: AuthorizationContext,
    vehicleId: string,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    await this.accessibleVehicle(context, vehicleId);
    const key = requiredKey(idempotencyKey);
    const replay = await this.replay(cid, key, 'GENERATE_PLANS', { vehicleId });
    if (replay) return replay;
    const result = await this.materializeVehicle(cid, vehicleId, correlationId);
    await this.connection.db.transaction(async (tx) => {
      await this.receipt(tx, cid, key, 'GENERATE_PLANS', { vehicleId }, result);
      await this.audit(tx, context, 'REMINDER_PLANS_GENERATED', vehicleId, correlationId, result);
    });
    return result;
  }

  async materializeVehicle(cid: string, vehicleId: string, correlationId: string) {
    const [vehicle] = await this.connection.db
      .select()
      .from(schema.customerVehicles)
      .where(
        and(
          eq(schema.customerVehicles.clientOrganizationId, cid),
          eq(schema.customerVehicles.id, vehicleId),
        ),
      )
      .limit(1);
    if (!vehicle) throw missing('Customer vehicle was not found.');
    const rules = await this.connection.db
      .select({ definition: schema.reminderDefinitions, rule: schema.reminderRuleTemplates })
      .from(schema.reminderRuleTemplates)
      .innerJoin(
        schema.reminderDefinitions,
        and(
          eq(schema.reminderDefinitions.clientOrganizationId, cid),
          eq(schema.reminderDefinitions.id, schema.reminderRuleTemplates.reminderDefinitionId),
          eq(schema.reminderDefinitions.active, true),
        ),
      )
      .where(
        and(
          eq(schema.reminderRuleTemplates.clientOrganizationId, cid),
          eq(schema.reminderRuleTemplates.active, true),
        ),
      );
    let planCount = 0;
    let instanceCount = 0;
    for (const row of rules.filter(({ rule }) => this.matches(vehicle, rule))) {
      const due = this.dueFor(vehicle, row.rule);
      if (!due) continue;
      const result = await this.connection.db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(schema.customerReminderPlans)
          .where(
            and(
              eq(schema.customerReminderPlans.clientOrganizationId, cid),
              eq(schema.customerReminderPlans.customerVehicleId, vehicleId),
              eq(schema.customerReminderPlans.ruleTemplateId, row.rule.id),
            ),
          )
          .limit(1);
        const changed =
          !existing ||
          existing.sourceVehicleVersion !== vehicle.version ||
          existing.ruleVersion !== row.rule.version ||
          existing.dueAt?.getTime() !== due.dueAt?.getTime() ||
          existing.dueKilometres !== due.dueKilometres;
        const [plan] = existing
          ? await tx
              .update(schema.customerReminderPlans)
              .set({
                active: true,
                dueAt: due.dueAt,
                dueKilometres: due.dueKilometres,
                ruleVersion: row.rule.version,
                scheduleVersion: changed ? existing.scheduleVersion + 1 : existing.scheduleVersion,
                sourceVehicleVersion: vehicle.version,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.customerReminderPlans.clientOrganizationId, cid),
                  eq(schema.customerReminderPlans.id, existing.id),
                ),
              )
              .returning()
          : await tx
              .insert(schema.customerReminderPlans)
              .values({
                clientOrganizationId: cid,
                customerVehicleId: vehicle.id,
                dueAt: due.dueAt,
                dueKilometres: due.dueKilometres,
                ruleTemplateId: row.rule.id,
                ruleVersion: row.rule.version,
                sourceVehicleVersion: vehicle.version,
              })
              .returning();
        if (!plan) throw new Error('Reminder plan upsert returned no row.');
        if (changed && existing) {
          const cancelled = await tx
            .update(schema.reminderInstances)
            .set({
              status: 'CANCELLED',
              suppressionReason: 'Plan superseded by vehicle or rule change.',
              updatedAt: new Date(),
              version: sql`${schema.reminderInstances.version} + 1`,
            })
            .where(
              and(
                eq(schema.reminderInstances.clientOrganizationId, cid),
                eq(schema.reminderInstances.customerReminderPlanId, plan.id),
                eq(schema.reminderInstances.status, 'SCHEDULED'),
              ),
            )
            .returning({ id: schema.reminderInstances.id });
          for (const item of cancelled)
            await tx.insert(schema.reminderEvents).values({
              clientOrganizationId: cid,
              correlationId,
              eventType: 'PLAN_SUPERSEDED',
              fromStatus: 'SCHEDULED',
              reason: 'Vehicle or rule details changed.',
              reminderInstanceId: item.id,
              toStatus: 'CANCELLED',
            });
        }
        let created = 0;
        const dueAt = due.dueAt;
        const scheduledDates = dueAt
          ? row.rule.noticeDays.map((days) => ({ offset: days, when: addDays(dueAt, -days) }))
          : vehicle.currentOdometerKm !== null &&
              due.dueKilometres !== null &&
              vehicle.currentOdometerKm >= due.dueKilometres
            ? [{ offset: 0, when: new Date() }]
            : [];
        for (const schedule of scheduledDates) {
          const materializationKey = `${plan.id}:${plan.scheduleVersion}:${schedule.offset}`;
          const inserted = await tx
            .insert(schema.reminderInstances)
            .values({
              category: row.rule.category,
              channel: row.rule.channel,
              clientOrganizationId: cid,
              customerReminderPlanId: plan.id,
              materializationKey,
              scheduledFor: schedule.when,
              templateId: row.rule.templateId,
            })
            .onConflictDoNothing()
            .returning({ id: schema.reminderInstances.id });
          if (inserted[0]) {
            created += 1;
            await tx.insert(schema.reminderEvents).values({
              clientOrganizationId: cid,
              correlationId,
              eventType: 'REMINDER_MATERIALIZED',
              reminderInstanceId: inserted[0].id,
              toStatus: 'SCHEDULED',
            });
          }
        }
        return { created, changed };
      });
      planCount += result.changed ? 1 : 0;
      instanceCount += result.created;
    }
    return { instances_created: instanceCount, plans_changed: planCount, vehicle_id: vehicleId };
  }

  async updateVehicleDetails(
    context: AuthorizationContext,
    vehicleId: string,
    body: UpdateVehicleReminderDetailsRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    await this.accessibleVehicle(context, vehicleId);
    const key = requiredKey(idempotencyKey);
    const replay = await this.replay(cid, key, 'UPDATE_VEHICLE_REMINDER_DETAILS', {
      body,
      vehicleId,
    });
    if (replay) {
      const generated = await this.materializeVehicle(cid, vehicleId, correlationId);
      return { ...replay, ...generated };
    }
    await this.connection.db.transaction(async (tx) => {
      const updated = await tx
        .update(schema.customerVehicles)
        .set({
          currentOdometerKm: body.current_odometer_km,
          modelYear: body.model_year,
          pucExpiresOn: body.puc_expires_on,
          serviceDueKilometres: body.service_due_kilometres,
          serviceDueOn: body.service_due_on,
          servicePlanVersion: body.service_plan_version,
          updatedAt: new Date(),
          version: sql`${schema.customerVehicles.version} + 1`,
        })
        .where(
          and(
            eq(schema.customerVehicles.clientOrganizationId, cid),
            eq(schema.customerVehicles.id, vehicleId),
            eq(schema.customerVehicles.version, body.expected_vehicle_version),
          ),
        )
        .returning({ version: schema.customerVehicles.version });
      if (!updated[0])
        throw conflict('VERSION_CONFLICT', 'Vehicle details changed; refresh before retrying.');
      await tx.insert(schema.customerVehicleEvents).values({
        actorMembershipId: context.membershipId,
        clientOrganizationId: cid,
        correlationId,
        customerVehicleId: vehicleId,
        eventType: 'REMINDER_DETAILS_UPDATED',
        reason: body.reason,
        evidence: {
          current_odometer_km: body.current_odometer_km,
          model_year: body.model_year,
          service_plan_version: body.service_plan_version,
        },
      });
      await this.audit(
        tx,
        context,
        'CUSTOMER_VEHICLE_REMINDER_DETAILS_UPDATED',
        vehicleId,
        correlationId,
        { version: updated[0].version },
      );
      await this.receipt(
        tx,
        cid,
        key,
        'UPDATE_VEHICLE_REMINDER_DETAILS',
        { body, vehicleId },
        { vehicle_version: updated[0].version },
      );
    });
    const generated = await this.materializeVehicle(cid, vehicleId, correlationId);
    const response = { ...generated, vehicle_version: body.expected_vehicle_version + 1 };
    return response;
  }

  async preferences(context: AuthorizationContext, vehicleId: string) {
    const vehicle = await this.accessibleVehicle(context, vehicleId);
    const [row] = await this.connection.db
      .select()
      .from(schema.customerReminderPreferences)
      .where(
        and(
          eq(schema.customerReminderPreferences.clientOrganizationId, clientId(context)),
          eq(schema.customerReminderPreferences.customerVehicleId, vehicle.id),
        ),
      )
      .limit(1);
    return (
      row ?? {
        customerVehicleId: vehicle.id,
        marketingEnabled: false,
        operationalEnabled: true,
        preferredChannel: 'WHATSAPP',
        version: null,
      }
    );
  }

  async updatePreferences(
    context: AuthorizationContext,
    vehicleId: string,
    body: UpdateReminderPreferencesRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    await this.accessibleVehicle(context, vehicleId);
    const key = requiredKey(idempotencyKey);
    const replay = await this.replay(cid, key, 'UPDATE_REMINDER_PREFERENCES', { body, vehicleId });
    if (replay) return replay;
    const response = await this.connection.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.customerReminderPreferences)
        .where(
          and(
            eq(schema.customerReminderPreferences.clientOrganizationId, cid),
            eq(schema.customerReminderPreferences.customerVehicleId, vehicleId),
          ),
        )
        .limit(1);
      if ((existing?.version ?? null) !== body.expected_version)
        throw conflict(
          'VERSION_CONFLICT',
          'Reminder preferences changed; refresh before retrying.',
        );
      const [saved] = existing
        ? await tx
            .update(schema.customerReminderPreferences)
            .set({
              marketingEnabled: body.marketing_enabled,
              operationalEnabled: body.operational_enabled,
              preferredChannel: body.preferred_channel,
              updatedAt: new Date(),
              updatedByMembershipId: context.membershipId,
              version: existing.version + 1,
            })
            .where(
              and(
                eq(schema.customerReminderPreferences.clientOrganizationId, cid),
                eq(schema.customerReminderPreferences.id, existing.id),
              ),
            )
            .returning()
        : await tx
            .insert(schema.customerReminderPreferences)
            .values({
              clientOrganizationId: cid,
              customerVehicleId: vehicleId,
              marketingEnabled: body.marketing_enabled,
              operationalEnabled: body.operational_enabled,
              preferredChannel: body.preferred_channel,
              updatedByMembershipId: context.membershipId,
            })
            .returning();
      await this.audit(
        tx,
        context,
        'REMINDER_PREFERENCES_UPDATED',
        vehicleId,
        correlationId,
        {
          marketing_enabled: body.marketing_enabled,
          operational_enabled: body.operational_enabled,
          preferred_channel: body.preferred_channel,
        },
        body.reason,
      );
      if (!saved) throw new Error('Reminder preference upsert returned no row.');
      const result = { id: saved.id, version: saved.version };
      await this.receipt(tx, cid, key, 'UPDATE_REMINDER_PREFERENCES', { body, vehicleId }, result);
      return result;
    });
    return response;
  }

  async recordConsent(
    context: AuthorizationContext,
    vehicleId: string,
    body: RecordReminderConsentRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const vehicle = await this.accessibleVehicle(context, vehicleId);
    const key = requiredKey(idempotencyKey);
    const replay = await this.replay(cid, key, 'RECORD_REMINDER_CONSENT', { body, vehicleId });
    if (replay) return replay;
    return this.connection.db.transaction(async (tx) => {
      const [record] = await tx
        .insert(schema.messagingOptInRecords)
        .values({
          capturedAt: new Date(),
          category: 'MARKETING',
          channel: body.channel,
          clientOrganizationId: cid,
          contactId: vehicle.contactId,
          createdByUserId: context.userId,
          evidence: body.evidence,
          noticeVersion: body.notice_version,
          source: body.source,
          status: body.status,
        })
        .returning({ id: schema.messagingOptInRecords.id });
      if (!record) throw new Error('Consent record insert returned no row.');
      await this.audit(
        tx,
        context,
        'REMINDER_MARKETING_CONSENT_RECORDED',
        record.id,
        correlationId,
        { channel: body.channel, contact_id: vehicle.contactId, status: body.status },
        body.evidence,
      );
      const response = { consent_reference_id: record.id, status: body.status };
      await this.receipt(tx, cid, key, 'RECORD_REMINDER_CONSENT', { body, vehicleId }, response);
      return response;
    });
  }

  async reschedule(
    context: AuthorizationContext,
    instanceId: string,
    body: RescheduleReminderRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    await this.accessibleInstance(context, instanceId);
    const key = requiredKey(idempotencyKey);
    const replay = await this.replay(cid, key, 'RESCHEDULE_REMINDER', { body, instanceId });
    if (replay) return replay;
    return this.connection.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.reminderInstances)
        .set({
          scheduledFor: new Date(body.scheduled_for),
          status: 'SCHEDULED',
          suppressionReason: null,
          updatedAt: new Date(),
          version: body.expected_version + 1,
        })
        .where(
          and(
            eq(schema.reminderInstances.clientOrganizationId, cid),
            eq(schema.reminderInstances.id, instanceId),
            eq(schema.reminderInstances.version, body.expected_version),
            inArray(schema.reminderInstances.status, ['SCHEDULED', 'FAILED', 'SUPPRESSED']),
          ),
        )
        .returning();
      if (!updated)
        throw conflict('VERSION_CONFLICT', 'Reminder changed or cannot be rescheduled.');
      await tx.insert(schema.reminderEvents).values({
        actorMembershipId: context.membershipId,
        clientOrganizationId: cid,
        correlationId,
        eventType: 'REMINDER_RESCHEDULED',
        reason: body.reason,
        reminderInstanceId: instanceId,
        toStatus: 'SCHEDULED',
        evidence: { scheduled_for: body.scheduled_for },
      });
      await this.audit(
        tx,
        context,
        'REMINDER_RESCHEDULED',
        instanceId,
        correlationId,
        { scheduled_for: body.scheduled_for },
        body.reason,
      );
      const response = this.presentInstance(updated);
      await this.receipt(tx, cid, key, 'RESCHEDULE_REMINDER', { body, instanceId }, response);
      return response;
    });
  }

  async queueDue(cid: string, correlationId: string) {
    const rows = await this.connection.db
      .select({
        instance: schema.reminderInstances,
        plan: schema.customerReminderPlans,
        preference: schema.customerReminderPreferences,
        vehicle: schema.customerVehicles,
      })
      .from(schema.reminderInstances)
      .innerJoin(
        schema.customerReminderPlans,
        and(
          eq(schema.customerReminderPlans.clientOrganizationId, cid),
          eq(schema.customerReminderPlans.id, schema.reminderInstances.customerReminderPlanId),
        ),
      )
      .innerJoin(
        schema.customerVehicles,
        and(
          eq(schema.customerVehicles.clientOrganizationId, cid),
          eq(schema.customerVehicles.id, schema.customerReminderPlans.customerVehicleId),
        ),
      )
      .leftJoin(
        schema.customerReminderPreferences,
        and(
          eq(schema.customerReminderPreferences.clientOrganizationId, cid),
          eq(schema.customerReminderPreferences.customerVehicleId, schema.customerVehicles.id),
        ),
      )
      .where(
        and(
          eq(schema.reminderInstances.clientOrganizationId, cid),
          eq(schema.reminderInstances.status, 'SCHEDULED'),
          lte(schema.reminderInstances.scheduledFor, new Date()),
        ),
      )
      .limit(200);
    let queued = 0;
    let suppressed = 0;
    for (const row of rows) {
      const policyResult = await this.deliveryPolicy(
        cid,
        row.vehicle.contactId,
        row.instance.category,
        row.instance.channel,
        row.preference,
      );
      const outboxId = await this.connection.db.transaction(async (tx) => {
        if (policyResult.reason) {
          const changed = await tx
            .update(schema.reminderInstances)
            .set({
              status: 'SUPPRESSED',
              suppressionReason: policyResult.reason,
              updatedAt: new Date(),
              version: sql`${schema.reminderInstances.version} + 1`,
            })
            .where(
              and(
                eq(schema.reminderInstances.clientOrganizationId, cid),
                eq(schema.reminderInstances.id, row.instance.id),
                eq(schema.reminderInstances.status, 'SCHEDULED'),
              ),
            )
            .returning({ id: schema.reminderInstances.id });
          if (!changed[0]) return undefined;
          suppressed += 1;
          await tx.insert(schema.reminderEvents).values({
            clientOrganizationId: cid,
            correlationId,
            eventType: 'REMINDER_SUPPRESSED',
            fromStatus: 'SCHEDULED',
            reason: policyResult.reason,
            reminderInstanceId: row.instance.id,
            toStatus: 'SUPPRESSED',
          });
          return undefined;
        }
        const changed = await tx
          .update(schema.reminderInstances)
          .set({
            status: 'QUEUED',
            consentReferenceId: policyResult.consentReferenceId,
            updatedAt: new Date(),
            version: sql`${schema.reminderInstances.version} + 1`,
          })
          .where(
            and(
              eq(schema.reminderInstances.clientOrganizationId, cid),
              eq(schema.reminderInstances.id, row.instance.id),
              eq(schema.reminderInstances.status, 'SCHEDULED'),
            ),
          )
          .returning({ id: schema.reminderInstances.id });
        if (!changed[0]) return undefined;
        const [outbox] = await tx
          .insert(schema.reminderDispatchOutbox)
          .values({ clientOrganizationId: cid, reminderInstanceId: row.instance.id })
          .onConflictDoNothing()
          .returning({ id: schema.reminderDispatchOutbox.id });
        await tx.insert(schema.reminderEvents).values({
          clientOrganizationId: cid,
          correlationId,
          eventType: 'REMINDER_QUEUED',
          fromStatus: 'SCHEDULED',
          reminderInstanceId: row.instance.id,
          toStatus: 'QUEUED',
        });
        queued += 1;
        return outbox?.id;
      });
      if (outboxId) await this.enqueueDispatch(outboxId);
    }
    return { queued, suppressed };
  }

  async queueDueForContext(context: AuthorizationContext, correlationId: string) {
    return this.queueDue(clientId(context), correlationId);
  }

  async queueDueAllTenants() {
    const tenants = await this.connection.db
      .selectDistinct({ clientOrganizationId: schema.reminderInstances.clientOrganizationId })
      .from(schema.reminderInstances)
      .where(
        and(
          eq(schema.reminderInstances.status, 'SCHEDULED'),
          lte(schema.reminderInstances.scheduledFor, new Date()),
        ),
      )
      .limit(100);
    const summary = { queued: 0, suppressed: 0, tenants: tenants.length };
    const scanId = new Date().toISOString();
    for (const tenant of tenants) {
      const result = await this.queueDue(
        tenant.clientOrganizationId,
        `worker-reminder-due-scan-${scanId}`,
      );
      summary.queued += result.queued;
      summary.suppressed += result.suppressed;
    }
    return summary;
  }

  private async enqueueDispatch(outboxId: string): Promise<void> {
    if (!this.queueFactory) return;
    try {
      this.backgroundQueue ??= this.queueFactory.createQueue(PLATFORM_BACKGROUND_QUEUE);
      await this.backgroundQueue.add(
        'reminders.dispatch',
        { outboxId },
        {
          attempts: 5,
          backoff: { delay: 60_000, type: 'exponential' },
          jobId: `reminder-dispatch-${outboxId}`,
          removeOnComplete: 1_000,
          removeOnFail: 1_000,
        },
      );
    } catch (error) {
      await this.connection.db
        .update(schema.reminderDispatchOutbox)
        .set({
          lastErrorMessage:
            `${error instanceof Error ? error.message : 'Queue unavailable.'} PostgreSQL dispatch remains recoverable.`.slice(
              0,
              1000,
            ),
          updatedAt: new Date(),
        })
        .where(eq(schema.reminderDispatchOutbox.id, outboxId));
    }
  }

  async processDispatch(outboxId: string) {
    const [outbox] = await this.connection.db
      .update(schema.reminderDispatchOutbox)
      .set({
        attempts: sql`${schema.reminderDispatchOutbox.attempts} + 1`,
        lockedAt: new Date(),
        lockedBy: `worker-${process.pid}`,
        status: 'PROCESSING',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.reminderDispatchOutbox.id, outboxId),
          inArray(schema.reminderDispatchOutbox.status, ['PENDING', 'FAILED']),
        ),
      )
      .returning();
    if (!outbox) return { skipped: true };
    const [row] = await this.connection.db
      .select({
        contactName: schema.contacts.displayName,
        definition: schema.reminderDefinitions,
        instance: schema.reminderInstances,
        template: schema.messageTemplates,
        vehicle: schema.customerVehicles,
      })
      .from(schema.reminderInstances)
      .innerJoin(
        schema.customerReminderPlans,
        eq(schema.customerReminderPlans.id, schema.reminderInstances.customerReminderPlanId),
      )
      .innerJoin(
        schema.customerVehicles,
        eq(schema.customerVehicles.id, schema.customerReminderPlans.customerVehicleId),
      )
      .innerJoin(
        schema.reminderRuleTemplates,
        eq(schema.reminderRuleTemplates.id, schema.customerReminderPlans.ruleTemplateId),
      )
      .innerJoin(
        schema.reminderDefinitions,
        eq(schema.reminderDefinitions.id, schema.reminderRuleTemplates.reminderDefinitionId),
      )
      .innerJoin(
        schema.messageTemplates,
        eq(schema.messageTemplates.id, schema.reminderInstances.templateId),
      )
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.customerVehicles.contactId))
      .where(
        and(
          eq(schema.reminderInstances.clientOrganizationId, outbox.clientOrganizationId),
          eq(schema.reminderInstances.id, outbox.reminderInstanceId),
        ),
      )
      .limit(1);
    if (!row) throw missing('Reminder dispatch aggregate was not found.');
    try {
      const dueLabel = row.instance.scheduledFor.toISOString();
      const variableValues = [
        row.contactName,
        `${row.vehicle.brandName} ${row.vehicle.modelName} ${row.vehicle.variantName}`,
        labels[row.definition.type],
        dueLabel,
      ];
      const variables = Object.fromEntries(
        messageTemplateVariableKeys(row.template.bodyText).map((key, index) => [
          key,
          variableValues[index] ?? dueLabel,
        ]),
      );
      const message = await this.messaging.queueAutomatedReminder({
        category: row.instance.category,
        clientOrganizationId: outbox.clientOrganizationId,
        contactId: row.vehicle.contactId,
        correlationId: `reminder-${row.instance.id}`,
        idempotencyKey: `reminder:${row.instance.id}`,
        templateId: row.instance.templateId,
        variables,
      });
      await this.connection.db.transaction(async (tx) => {
        await tx
          .update(schema.reminderDispatchOutbox)
          .set({ providerMessageId: message.messageId, status: 'SENT', updatedAt: new Date() })
          .where(eq(schema.reminderDispatchOutbox.id, outbox.id));
        await tx
          .update(schema.reminderInstances)
          .set({
            status: 'SENT',
            updatedAt: new Date(),
            version: sql`${schema.reminderInstances.version} + 1`,
          })
          .where(eq(schema.reminderInstances.id, row.instance.id));
        await tx.insert(schema.reminderEvents).values({
          clientOrganizationId: outbox.clientOrganizationId,
          correlationId: `reminder-${row.instance.id}`,
          eventType: 'REMINDER_SENT_TO_COMMUNICATION_OUTBOX',
          fromStatus: 'QUEUED',
          evidence: { message_id: message.messageId },
          reminderInstanceId: row.instance.id,
          toStatus: 'SENT',
        });
        await tx.insert(schema.customerActivities).values({
          activityType: 'REMINDER',
          clientOrganizationId: outbox.clientOrganizationId,
          contactId: row.vehicle.contactId,
          customerVehicleId: row.vehicle.id,
          details: `${labels[row.definition.type]} reminder queued through the official communication adapter.`,
          metadata: { reminder_instance_id: row.instance.id },
          occurredAt: new Date(),
          subject: labels[row.definition.type],
        });
      });
      return { message_id: message.messageId, sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reminder adapter failed.';
      await this.connection.db.transaction(async (tx) => {
        await tx
          .update(schema.reminderDispatchOutbox)
          .set({
            availableAt: addDays(new Date(), 1 / 24),
            lastErrorCode: 'ADAPTER_FAILED',
            lastErrorMessage: message.slice(0, 1000),
            status: outbox.attempts >= 5 ? 'DEAD_LETTER' : 'FAILED',
            updatedAt: new Date(),
          })
          .where(eq(schema.reminderDispatchOutbox.id, outbox.id));
        await tx
          .update(schema.reminderInstances)
          .set({
            retryCount: sql`${schema.reminderInstances.retryCount} + 1`,
            status: 'FAILED',
            updatedAt: new Date(),
            version: sql`${schema.reminderInstances.version} + 1`,
          })
          .where(eq(schema.reminderInstances.id, row.instance.id));
        await tx.insert(schema.reminderEvents).values({
          clientOrganizationId: outbox.clientOrganizationId,
          correlationId: `reminder-${row.instance.id}`,
          eventType: 'REMINDER_DISPATCH_FAILED',
          fromStatus: 'QUEUED',
          reason: message.slice(0, 1000),
          reminderInstanceId: row.instance.id,
          toStatus: 'FAILED',
        });
      });
      throw error;
    }
  }

  async reconcileDeliveryStatuses(cid: string) {
    const rows = await this.connection.db
      .select({
        instanceId: schema.reminderInstances.id,
        messageId: schema.reminderDispatchOutbox.providerMessageId,
        status: schema.messages.status,
      })
      .from(schema.reminderDispatchOutbox)
      .innerJoin(
        schema.reminderInstances,
        and(
          eq(schema.reminderInstances.clientOrganizationId, cid),
          eq(schema.reminderInstances.id, schema.reminderDispatchOutbox.reminderInstanceId),
        ),
      )
      .innerJoin(
        schema.messages,
        and(
          eq(schema.messages.clientOrganizationId, cid),
          eq(schema.messages.id, schema.reminderDispatchOutbox.providerMessageId),
        ),
      )
      .where(
        and(
          eq(schema.reminderDispatchOutbox.clientOrganizationId, cid),
          eq(schema.reminderInstances.status, 'SENT'),
          eq(schema.messages.status, 'DELIVERED'),
        ),
      );
    for (const row of rows)
      await this.connection.db.transaction(async (tx) => {
        await tx
          .update(schema.reminderInstances)
          .set({
            status: 'DELIVERED',
            updatedAt: new Date(),
            version: sql`${schema.reminderInstances.version} + 1`,
          })
          .where(eq(schema.reminderInstances.id, row.instanceId));
        await tx.insert(schema.reminderEvents).values({
          clientOrganizationId: cid,
          correlationId: `reminder-reconcile-${row.instanceId}`,
          eventType: 'REMINDER_DELIVERED',
          fromStatus: 'SENT',
          evidence: { message_id: row.messageId },
          reminderInstanceId: row.instanceId,
          toStatus: 'DELIVERED',
        });
      });
    return { delivered: rows.length };
  }

  async appendActivity(
    context: AuthorizationContext,
    contactId: string,
    body: CustomerActivityRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const key = requiredKey(idempotencyKey);
    const replay = await this.replay(cid, key, 'APPEND_CUSTOMER_ACTIVITY', { body, contactId });
    if (replay) return replay;
    const [contact] = await this.connection.db
      .select({ id: schema.contacts.id })
      .from(schema.contacts)
      .where(and(eq(schema.contacts.clientOrganizationId, cid), eq(schema.contacts.id, contactId)))
      .limit(1);
    if (!contact) throw missing('Contact was not found.');
    if (body.customer_vehicle_id) await this.accessibleVehicle(context, body.customer_vehicle_id);
    return this.connection.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.customerActivities)
        .values({
          activityType: body.activity_type,
          actorMembershipId: context.membershipId,
          clientOrganizationId: cid,
          contactId,
          customerVehicleId: body.customer_vehicle_id,
          details: body.details,
          occurredAt: new Date(body.occurred_at),
          subject: body.subject,
        })
        .returning({ id: schema.customerActivities.id });
      if (!created) throw new Error('Customer activity insert returned no row.');
      await this.audit(tx, context, 'CUSTOMER_ACTIVITY_APPENDED', created.id, correlationId, {
        activity_type: body.activity_type,
        contact_id: contactId,
      });
      const response = { id: created.id };
      await this.receipt(tx, cid, key, 'APPEND_CUSTOMER_ACTIVITY', { body, contactId }, response);
      return response;
    });
  }

  private async ensureDefinitions(db: DatabaseConnection['db'] | Tx, cid: string) {
    for (const type of REMINDER_TYPES)
      await db
        .insert(schema.reminderDefinitions)
        .values({
          clientOrganizationId: cid,
          defaultCategory:
            type === 'EXCHANGE_ELIGIBILITY' || type === 'UPGRADE_OPPORTUNITY'
              ? 'MARKETING'
              : 'OPERATIONAL',
          displayName: labels[type],
          type,
        })
        .onConflictDoNothing();
  }

  private matches(vehicle: Vehicle, rule: Rule): boolean {
    return (
      (!rule.brandName || rule.brandName.toLowerCase() === vehicle.brandName.toLowerCase()) &&
      (!rule.modelName || rule.modelName.toLowerCase() === vehicle.modelName.toLowerCase()) &&
      (!rule.variantName || rule.variantName.toLowerCase() === vehicle.variantName.toLowerCase()) &&
      (!rule.modelYear || rule.modelYear === vehicle.modelYear)
    );
  }

  private dueFor(
    vehicle: Vehicle,
    rule: Rule,
  ): { dueAt: Date | null; dueKilometres: number | null } | null {
    if (rule.thresholdKind === 'KILOMETRE')
      return rule.dueKilometres ? { dueAt: null, dueKilometres: rule.dueKilometres } : null;
    if (!rule.baseDateField) return null;
    const base = (
      {
        AMC_EXPIRY: dateValue(vehicle.amcExpiresOn),
        DELIVERY_DATE: dateValue(vehicle.deliveryDate),
        INSURANCE_EXPIRY: dateValue(vehicle.insuranceExpiresOn),
        PUC_EXPIRY: dateValue(vehicle.pucExpiresOn),
        PURCHASE_DATE: dateValue(vehicle.purchaseDate),
        RSA_EXPIRY: dateValue(vehicle.rsaExpiresOn),
        WARRANTY_EXPIRY: dateValue(vehicle.warrantyExpiresOn),
      } as const
    )[rule.baseDateField];
    return base && rule.dueAfterDays !== null
      ? { dueAt: addDays(base, rule.dueAfterDays), dueKilometres: null }
      : null;
  }

  private async deliveryPolicy(
    cid: string,
    contactId: string,
    category: 'MARKETING' | 'OPERATIONAL',
    channel: string,
    preference: typeof schema.customerReminderPreferences.$inferSelect | null,
  ): Promise<{ consentReferenceId: string | null; reason: string | null }> {
    if (category === 'MARKETING' && preference?.marketingEnabled !== true)
      return { consentReferenceId: null, reason: 'Marketing reminder preference is disabled.' };
    if (category === 'OPERATIONAL' && preference?.operationalEnabled === false)
      return { consentReferenceId: null, reason: 'Operational reminder preference is disabled.' };
    const now = new Date();
    const suppressions = await this.connection.db
      .select()
      .from(schema.messagingSuppressions)
      .where(
        and(
          eq(schema.messagingSuppressions.clientOrganizationId, cid),
          eq(schema.messagingSuppressions.contactId, contactId),
          eq(schema.messagingSuppressions.channel, channel as 'WHATSAPP' | 'EMAIL' | 'SMS'),
          eq(schema.messagingSuppressions.active, true),
          lte(schema.messagingSuppressions.startsAt, now),
          or(
            sql`${schema.messagingSuppressions.endsAt} is null`,
            lte(sql`${now}`, schema.messagingSuppressions.endsAt),
          ),
        ),
      );
    if (
      suppressions.some(
        (entry) =>
          entry.scope === 'ALL' || (category === 'MARKETING' && entry.scope === 'MARKETING'),
      )
    )
      return {
        consentReferenceId: null,
        reason: 'An active messaging suppression blocks this reminder.',
      };
    if (category === 'MARKETING') {
      const [consent] = await this.connection.db
        .select()
        .from(schema.messagingOptInRecords)
        .where(
          and(
            eq(schema.messagingOptInRecords.clientOrganizationId, cid),
            eq(schema.messagingOptInRecords.contactId, contactId),
            eq(schema.messagingOptInRecords.channel, channel as 'WHATSAPP' | 'EMAIL' | 'SMS'),
            eq(schema.messagingOptInRecords.category, 'MARKETING'),
          ),
        )
        .orderBy(
          desc(schema.messagingOptInRecords.capturedAt),
          desc(schema.messagingOptInRecords.id),
        )
        .limit(1);
      if (consent?.status !== 'GRANTED')
        return { consentReferenceId: null, reason: 'Current marketing consent is not granted.' };
      return { consentReferenceId: consent.id, reason: null };
    }
    return { consentReferenceId: null, reason: null };
  }

  private canAccess(context: AuthorizationContext, vehicle: Vehicle): boolean {
    return this.policy.canAccessResource(context, {
      branchId: vehicle.branchId,
      clientOrganizationId: vehicle.clientOrganizationId,
    });
  }
  private async accessibleVehicle(
    context: AuthorizationContext,
    vehicleId: string,
  ): Promise<Vehicle> {
    const [vehicle] = await this.connection.db
      .select()
      .from(schema.customerVehicles)
      .where(
        and(
          eq(schema.customerVehicles.clientOrganizationId, clientId(context)),
          eq(schema.customerVehicles.id, vehicleId),
        ),
      )
      .limit(1);
    if (!vehicle || !this.canAccess(context, vehicle))
      throw missing('Customer vehicle was not found.');
    return vehicle;
  }
  private async accessibleInstance(context: AuthorizationContext, instanceId: string) {
    const [row] = await this.connection.db
      .select({ instance: schema.reminderInstances, vehicle: schema.customerVehicles })
      .from(schema.reminderInstances)
      .innerJoin(
        schema.customerReminderPlans,
        eq(schema.customerReminderPlans.id, schema.reminderInstances.customerReminderPlanId),
      )
      .innerJoin(
        schema.customerVehicles,
        eq(schema.customerVehicles.id, schema.customerReminderPlans.customerVehicleId),
      )
      .where(
        and(
          eq(schema.reminderInstances.clientOrganizationId, clientId(context)),
          eq(schema.reminderInstances.id, instanceId),
        ),
      )
      .limit(1);
    if (!row || !this.canAccess(context, row.vehicle)) throw missing('Reminder was not found.');
    return row;
  }
  private presentPlan(row: {
    contactName: string;
    definition: typeof schema.reminderDefinitions.$inferSelect;
    plan: typeof schema.customerReminderPlans.$inferSelect;
    rule: Rule;
    vehicle: Vehicle;
  }) {
    return {
      active: row.plan.active,
      category: row.rule.category,
      contact_name: row.contactName,
      due_at: row.plan.dueAt?.toISOString() ?? null,
      due_kilometres: row.plan.dueKilometres,
      id: row.plan.id,
      reminder_type: row.definition.type,
      schedule_version: row.plan.scheduleVersion,
      vehicle: `${row.vehicle.brandName} ${row.vehicle.modelName} ${row.vehicle.variantName}`,
      vehicle_id: row.vehicle.id,
    };
  }
  private presentInstance(
    row: typeof schema.reminderInstances.$inferSelect,
  ): Record<string, unknown> {
    return {
      category: row.category,
      channel: row.channel,
      id: row.id,
      retry_count: row.retryCount,
      scheduled_for: row.scheduledFor.toISOString(),
      status: row.status,
      suppression_reason: row.suppressionReason,
      version: row.version,
    };
  }
  private async replay(
    cid: string,
    idempotencyKey: string,
    commandType: string,
    payload: unknown,
  ): Promise<Record<string, unknown> | null> {
    const [row] = await this.connection.db
      .select()
      .from(schema.reminderCommandReceipts)
      .where(
        and(
          eq(schema.reminderCommandReceipts.clientOrganizationId, cid),
          eq(schema.reminderCommandReceipts.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!row) return null;
    if (row.commandType !== commandType || row.requestFingerprint !== fingerprint(payload))
      throw conflict(
        'IDEMPOTENCY_KEY_REUSED',
        'The idempotency key was reused with a different reminder command.',
      );
    return row.responseBody;
  }
  private async receipt(
    tx: Tx,
    cid: string,
    idempotencyKey: string,
    commandType: string,
    payload: unknown,
    responseBody: Record<string, unknown>,
  ) {
    await tx
      .insert(schema.reminderCommandReceipts)
      .values({
        clientOrganizationId: cid,
        commandType,
        idempotencyKey,
        requestFingerprint: fingerprint(payload),
        responseBody,
      })
      .onConflictDoNothing();
  }
  private async audit(
    tx: Tx,
    context: AuthorizationContext,
    action: string,
    entityId: string,
    correlationId: string,
    newSummary: Record<string, unknown>,
    reason?: string,
  ) {
    await tx.insert(schema.auditEvents).values({
      action,
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId: clientId(context),
      correlationId,
      effectiveRole: context.roleCode,
      entityId,
      entityType: 'REMINDER',
      newSummary,
      outcome: 'SUCCESS',
      reason,
      scope: 'CLIENT',
    });
    await tx.insert(schema.outboxEvents).values({
      aggregateId: entityId,
      aggregateType: 'REMINDER',
      clientOrganizationId: clientId(context),
      correlationId,
      eventType: action,
      payload: newSummary,
      scope: 'CLIENT',
    });
  }
}
