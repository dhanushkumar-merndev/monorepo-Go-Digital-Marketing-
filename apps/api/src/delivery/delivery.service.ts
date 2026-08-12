/* Delivery workflow, proof, readiness and active-location authority live here. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssignDeliveryRequest,
  CompleteDeliveryProofUploadRequest,
  CompleteDeliveryRequest,
  CreateDeliveryJobRequest,
  DecideDeliveryReschedule,
  DeliveryExceptionRequest,
  DeliveryListQuery,
  DeliveryStatus,
  InitiateDeliveryProofUploadRequest,
  MarkDeliveryReadyRequest,
  RecordDeliveryLocationsRequest,
  RecordReceivedByProofRequest,
  RequestDeliveryOtpRequest,
  RequestDeliveryReschedule,
  ReviewDeliveryProofRequest,
  ScheduleDeliveryRequest,
  StartDeliveryRequest,
  UpdateDeliveryChecklistRequest,
  UpdateDeliverySettingsRequest,
  VerifyDeliveryOtpRequest,
} from '@gdm/contracts';
import { DELIVERY_CHECKLIST_CODES } from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import {
  authorizationScopeCondition,
  pageMetadata,
  pageOffset,
} from '../authorization/authorization-scope.sql.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { CommercialService } from '../commercial/commercial.service.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../infrastructure/storage/object-storage.port.js';
import { DELIVERY_OTP_SENDER, type DeliveryOtpSender } from './delivery-otp-sender.port.js';
import {
  DELIVERY_PROOF_SCANNER,
  type DeliveryProofScanner,
} from './delivery-proof-scanner.port.js';
import { DELIVERY_RUNTIME_CONFIG, type DeliveryRuntimeConfig } from './delivery-runtime-config.js';

type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];
type Job = typeof schema.deliveryJobs.$inferSelect;

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

function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException({ code, details: [], message, retryable: false });
}

function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, details: [], message, retryable: false });
}

function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });
}

function requiredKey(key: string | undefined): string {
  const normalized = key?.trim();
  if (!normalized || normalized.length > 128)
    throw badRequest('VALIDATION_ERROR', 'A valid Idempotency-Key header is required.');
  return normalized;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}

function fingerprint(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)), 'utf8')
    .digest('hex');
}

function databaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: unknown }).cause;
  return cause &&
    typeof cause === 'object' &&
    typeof (cause as { code?: unknown }).code === 'string'
    ? (cause as { code: string }).code
    : undefined;
}

@Injectable()
export class DeliveryService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
    @Inject(CommercialService) private readonly commercial: CommercialService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(DELIVERY_PROOF_SCANNER) private readonly scanner: DeliveryProofScanner,
    @Inject(DELIVERY_OTP_SENDER) private readonly otpSender: DeliveryOtpSender,
    @Inject(DELIVERY_RUNTIME_CONFIG) private readonly config: DeliveryRuntimeConfig,
  ) {}

  async list(context: AuthorizationContext, query: DeliveryListQuery) {
    const cid = clientId(context);
    await this.expireTracking(cid, new Date(), `delivery-list-${context.sessionId}`);
    const filters = [
      eq(schema.deliveryJobs.clientOrganizationId, cid),
      authorizationScopeCondition(context, {
        assignee: schema.deliveryJobs.assignedUserId,
        branch: schema.deliveryJobs.branchId,
      }),
    ];
    if (query.assigned_to_me)
      filters.push(eq(schema.deliveryJobs.assignedMembershipId, context.membershipId));
    if (query.status) filters.push(eq(schema.deliveryJobs.status, query.status));
    if (query.exception_only)
      filters.push(inArray(schema.deliveryJobs.status, ['DELAYED', 'FAILED']));
    if (query.date)
      filters.push(
        sql`(${schema.deliveryJobs.scheduledFor} at time zone ${schema.branches.timezone})::date = ${query.date}::date`,
      );
    if (query.from_date)
      filters.push(
        sql`(${schema.deliveryJobs.scheduledFor} at time zone ${schema.branches.timezone})::date >= ${query.from_date}::date`,
      );
    const rows = await this.connection.db
      .select({
        assignedName: schema.users.displayName,
        bookingReference: schema.bookings.bookingReference,
        brandName: schema.inventoryBrands.name,
        contact: schema.contacts,
        job: schema.deliveryJobs,
        modelName: schema.inventoryModels.name,
        unitReference: schema.inventoryUnits.unitReference,
        variantName: schema.inventoryVariants.name,
      })
      .from(schema.deliveryJobs)
      .innerJoin(
        schema.bookings,
        and(
          eq(schema.bookings.clientOrganizationId, cid),
          eq(schema.bookings.id, schema.deliveryJobs.bookingId),
        ),
      )
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.deliveryJobs.contactId),
        ),
      )
      .innerJoin(
        schema.inventoryUnits,
        and(
          eq(schema.inventoryUnits.clientOrganizationId, cid),
          eq(schema.inventoryUnits.id, schema.deliveryJobs.inventoryUnitId),
        ),
      )
      .innerJoin(
        schema.inventoryVariants,
        eq(schema.inventoryVariants.id, schema.inventoryUnits.variantId),
      )
      .innerJoin(
        schema.inventoryModels,
        eq(schema.inventoryModels.id, schema.inventoryVariants.modelId),
      )
      .innerJoin(
        schema.inventoryBrands,
        eq(schema.inventoryBrands.id, schema.inventoryModels.brandId),
      )
      .innerJoin(
        schema.branches,
        and(
          eq(schema.branches.clientOrganizationId, cid),
          eq(schema.branches.id, schema.deliveryJobs.branchId),
        ),
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.deliveryJobs.assignedUserId))
      .where(and(...filters))
      .orderBy(asc(schema.deliveryJobs.scheduledFor), asc(schema.deliveryJobs.id))
      .limit(query.limit + 1)
      .offset(pageOffset(query.page, query.limit));
    const scoped = rows.filter((row) => this.canAccess(context, row.job));
    const accessible = scoped.slice(0, query.limit);
    const locations = await this.latestLocations(
      cid,
      accessible.map((row) => row.job.id),
    );
    return {
      deliveries: accessible.map((row) =>
        this.presentSummary(row, locations.get(row.job.id) ?? null),
      ),
      pagination: pageMetadata(query.page, query.limit, scoped.length),
    };
  }

  async active(context: AuthorizationContext) {
    return this.list(context, {
      assigned_to_me: false,
      exception_only: false,
      limit: 100,
      page: 1,
      status: 'OUT_FOR_DELIVERY',
    });
  }

  async getSettings(context: AuthorizationContext) {
    return this.presentSettings(await this.settings(this.connection.db, clientId(context)));
  }

  updateSettings(
    context: AuthorizationContext,
    input: UpdateDeliverySettingsRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'SETTINGS_UPDATE', input, key, async (tx, cid) => {
      const current = await this.settings(tx, cid);
      if (current.version !== input.expected_version)
        throw conflict('CONCURRENT_UPDATE', 'Delivery settings changed; refresh before retrying.');
      const [updated] = await tx
        .update(schema.deliverySettings)
        .set({
          activeTimeoutMinutes: input.active_timeout_minutes,
          locationRetentionDays: input.location_retention_days,
          locationStaleSeconds: input.location_stale_seconds,
          requiredChecklistCodes: input.required_checklist_codes,
          requiredProofTypes: input.required_proof_types,
          updatedAt: new Date(),
          updatedByMembershipId: context.membershipId,
          version: current.version + 1,
        })
        .where(
          and(
            eq(schema.deliverySettings.clientOrganizationId, cid),
            eq(schema.deliverySettings.version, current.version),
          ),
        )
        .returning();
      if (!updated) throw conflict('CONCURRENT_UPDATE', 'Delivery settings changed concurrently.');
      const response = this.presentSettings(updated);
      await this.record(
        tx,
        context,
        cid,
        'DELIVERY_SETTINGS_UPDATED',
        cid,
        correlationId,
        response,
        input.reason,
        'DELIVERY_SETTINGS',
      );
      return response;
    });
  }

  async detail(context: AuthorizationContext, jobId: string) {
    const job = await this.accessibleJob(context, jobId);
    const cid = clientId(context);
    const [summary, checklist, proofs, events, latest] = await Promise.all([
      this.summaryRow(cid, jobId),
      this.connection.db
        .select()
        .from(schema.deliveryChecklistItems)
        .where(
          and(
            eq(schema.deliveryChecklistItems.clientOrganizationId, cid),
            eq(schema.deliveryChecklistItems.deliveryJobId, jobId),
          ),
        )
        .orderBy(asc(schema.deliveryChecklistItems.code)),
      this.connection.db
        .select({
          createdAt: schema.deliveryProofs.createdAt,
          fileName: schema.deliveryProofs.fileName,
          id: schema.deliveryProofs.id,
          proofType: schema.deliveryProofs.proofType,
          receivedByName: schema.deliveryProofs.receivedByName,
          scannerStatus: schema.deliveryProofs.scannerStatus,
          status: schema.deliveryProofs.status,
        })
        .from(schema.deliveryProofs)
        .where(
          and(
            eq(schema.deliveryProofs.clientOrganizationId, cid),
            eq(schema.deliveryProofs.deliveryJobId, jobId),
          ),
        )
        .orderBy(desc(schema.deliveryProofs.createdAt)),
      this.connection.db
        .select({ event: schema.deliveryStatusEvents, actorName: schema.users.displayName })
        .from(schema.deliveryStatusEvents)
        .leftJoin(
          schema.memberships,
          eq(schema.memberships.id, schema.deliveryStatusEvents.actorMembershipId),
        )
        .leftJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(
          and(
            eq(schema.deliveryStatusEvents.clientOrganizationId, cid),
            eq(schema.deliveryStatusEvents.deliveryJobId, jobId),
          ),
        )
        .orderBy(asc(schema.deliveryStatusEvents.createdAt)),
      this.latestLocations(cid, [jobId]),
    ]);
    if (!summary) throw notFound('Delivery job not found.');
    const settings = await this.settings(this.connection.db, cid);
    return {
      checklist: checklist.map((item) => ({
        checked: item.checked,
        checked_at: item.checkedAt?.toISOString() ?? null,
        code: item.code,
        note: item.note,
        required: item.required,
      })),
      delivery: this.presentSummary(summary, latest.get(jobId) ?? null),
      events: events.map(({ actorName, event }) => ({
        actor_name: actorName,
        created_at: event.createdAt.toISOString(),
        event_type: event.eventType,
        from_status: event.fromStatus,
        id: event.id,
        reason: event.reason,
        to_status: event.toStatus,
      })),
      proofs: proofs.map((proof) => ({
        created_at: proof.createdAt.toISOString(),
        file_name: proof.fileName,
        id: proof.id,
        proof_type: proof.proofType,
        received_by: proof.receivedByName,
        scanner_status: proof.scannerStatus,
        status: proof.status,
      })),
      required_proof_types: settings.requiredProofTypes,
      reschedule: {
        requested_for: job.requestedScheduleAt?.toISOString() ?? null,
        status: job.rescheduleStatus,
      },
      tracking_expires_at: job.trackingExpiresAt?.toISOString() ?? null,
    };
  }

  async executives(context: AuthorizationContext, branchId: string) {
    const cid = clientId(context);
    if (!this.policy.canAccessBranch(context, branchId))
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: [],
        message: 'Branch access is denied.',
        retryable: false,
      });
    const rows = await this.connection.db
      .select({
        branchScopeMode: schema.memberships.branchScopeMode,
        displayName: schema.users.displayName,
        membershipId: schema.memberships.id,
        userId: schema.users.id,
      })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.roles.id, schema.memberships.roleId))
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .leftJoin(
        schema.membershipBranchScopes,
        and(
          eq(schema.membershipBranchScopes.clientOrganizationId, cid),
          eq(schema.membershipBranchScopes.membershipId, schema.memberships.id),
          eq(schema.membershipBranchScopes.branchId, branchId),
        ),
      )
      .where(
        and(
          eq(schema.memberships.clientOrganizationId, cid),
          eq(schema.memberships.status, 'ACTIVE'),
          eq(schema.roles.code, 'DELIVERY_EXECUTIVE'),
          eq(schema.users.status, 'ACTIVE'),
          or(
            eq(schema.memberships.branchScopeMode, 'ALL'),
            sql`${schema.membershipBranchScopes.branchId} is not null`,
          ),
        ),
      )
      .orderBy(asc(schema.users.displayName));
    return {
      executives: rows.map((row) => ({
        display_name: row.displayName,
        membership_id: row.membershipId,
        user_id: row.userId,
      })),
    };
  }

  create(
    context: AuthorizationContext,
    input: CreateDeliveryJobRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'CREATE', input, key, async (tx, cid) => {
      const [booking] = await tx
        .select()
        .from(schema.bookings)
        .where(
          and(
            eq(schema.bookings.clientOrganizationId, cid),
            eq(schema.bookings.id, input.booking_id),
          ),
        )
        .limit(1);
      if (!booking || !this.policy.canAccessBranch(context, booking.branchId))
        throw notFound('Booking not found.');
      if (booking.status !== 'CONFIRMED')
        throw conflict('BOOKING_NOT_CONFIRMED', 'A confirmed booking is required.');
      if (!booking.selectedInventoryUnitId)
        throw conflict('INVENTORY_NOT_ALLOCATED', 'A physical vehicle allocation is required.');
      const [allocation] = await tx
        .select({ id: schema.inventoryAllocations.id })
        .from(schema.inventoryAllocations)
        .where(
          and(
            eq(schema.inventoryAllocations.clientOrganizationId, cid),
            eq(schema.inventoryAllocations.inventoryUnitId, booking.selectedInventoryUnitId),
            eq(schema.inventoryAllocations.bookingId, booking.id),
            eq(schema.inventoryAllocations.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      if (!allocation)
        throw conflict(
          'INVENTORY_NOT_ALLOCATED',
          'The booking has no active canonical allocation.',
        );
      const assigned = input.assigned_membership_id
        ? await this.eligibleExecutive(context, booking.branchId, input.assigned_membership_id)
        : null;
      const [job] = await tx
        .insert(schema.deliveryJobs)
        .values({
          assignedMembershipId: assigned?.membership_id ?? null,
          assignedUserId: assigned?.user_id ?? null,
          bookingId: booking.id,
          branchId: booking.branchId,
          clientOrganizationId: cid,
          contactId: booking.contactId,
          createdByMembershipId: context.membershipId,
          destinationAddress: input.destination_address,
          destinationLatitude: input.destination_latitude,
          destinationLongitude: input.destination_longitude,
          inventoryUnitId: booking.selectedInventoryUnitId,
          leadId: booking.leadId,
          scheduledFor: new Date(input.scheduled_for),
        })
        .returning();
      if (!job) throw new Error('Delivery job insert did not return a row.');
      const settings = await this.settings(tx, cid);
      const required = new Set(settings.requiredChecklistCodes);
      await tx.insert(schema.deliveryChecklistItems).values(
        DELIVERY_CHECKLIST_CODES.map((code) => ({
          clientOrganizationId: cid,
          code,
          deliveryJobId: job.id,
          required: required.has(code),
        })),
      );
      await this.appendTransition(
        tx,
        context,
        job,
        null,
        'VEHICLE_ALLOCATED',
        'DELIVERY_CREATED',
        correlationId,
        { booking_id: booking.id, inventory_unit_id: booking.selectedInventoryUnitId },
      );
      return { id: job.id, status: job.status, version: job.version };
    });
  }

  assign(
    context: AuthorizationContext,
    jobId: string,
    input: AssignDeliveryRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'ASSIGN', { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, [
        'VEHICLE_ALLOCATED',
        'VEHICLE_PREPARATION',
        'READY_FOR_DELIVERY',
        'DELIVERY_SCHEDULED',
        'DELAYED',
        'FAILED',
      ]);
      const eligible = await this.eligibleExecutive(
        context,
        job.branchId,
        input.assigned_membership_id,
      );
      const updated = await this.updateJob(tx, job, job.status, {
        assignedMembershipId: eligible.membership_id,
        assignedUserId: eligible.user_id,
      });
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        updated.status,
        job.assignedMembershipId ? 'DELIVERY_REASSIGNED' : 'DELIVERY_ASSIGNED',
        correlationId,
        { assigned_membership_id: eligible.membership_id },
        input.reason,
      );
      return { id: updated.id, status: updated.status, version: updated.version };
    });
  }

  checklist(
    context: AuthorizationContext,
    jobId: string,
    input: UpdateDeliveryChecklistRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'CHECKLIST', { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, ['VEHICLE_ALLOCATED', 'VEHICLE_PREPARATION']);
      this.assertExecutorOrManager(context, job);
      const [item] = await tx
        .select()
        .from(schema.deliveryChecklistItems)
        .where(
          and(
            eq(schema.deliveryChecklistItems.clientOrganizationId, cid),
            eq(schema.deliveryChecklistItems.deliveryJobId, job.id),
            eq(schema.deliveryChecklistItems.code, input.code),
          ),
        )
        .limit(1);
      if (!item) throw notFound('Delivery checklist item not found.');
      const now = new Date();
      const [updatedItem] = await tx
        .update(schema.deliveryChecklistItems)
        .set({
          checked: input.checked,
          checkedAt: input.checked ? now : null,
          checkedByMembershipId: input.checked ? context.membershipId : null,
          note: input.note,
          version: item.version + 1,
        })
        .where(eq(schema.deliveryChecklistItems.id, item.id))
        .returning();
      if (!updatedItem) throw conflict('CONCURRENT_UPDATE', 'Checklist changed concurrently.');
      await tx.insert(schema.deliveryChecklistEvents).values({
        actorMembershipId: context.membershipId,
        checked: input.checked,
        checklistItemId: item.id,
        clientOrganizationId: cid,
        deliveryJobId: job.id,
        note: input.note,
      });
      const nextStatus = job.status === 'VEHICLE_ALLOCATED' ? 'VEHICLE_PREPARATION' : job.status;
      const updated = await this.updateJob(tx, job, nextStatus, {});
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        nextStatus,
        'DELIVERY_CHECKLIST_UPDATED',
        correlationId,
        { checked: input.checked, code: input.code },
        input.note ?? undefined,
      );
      return { id: updated.id, status: updated.status, version: updated.version };
    });
  }

  markReady(
    context: AuthorizationContext,
    jobId: string,
    input: MarkDeliveryReadyRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'MARK_READY', { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, ['VEHICLE_ALLOCATED', 'VEHICLE_PREPARATION']);
      await this.assertChecklistReady(tx, cid, job.id);
      const updated = await this.updateJob(tx, job, 'READY_FOR_DELIVERY', {});
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        'READY_FOR_DELIVERY',
        'DELIVERY_PREPARATION_COMPLETED',
        correlationId,
        {},
      );
      return { id: updated.id, status: updated.status, version: updated.version };
    });
  }

  schedule(
    context: AuthorizationContext,
    jobId: string,
    input: ScheduleDeliveryRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'SCHEDULE', { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, ['READY_FOR_DELIVERY']);
      if (!job.assignedMembershipId)
        throw conflict('ASSIGNEE_REQUIRED', 'Assign a delivery executive first.');
      const scheduledFor = new Date(input.scheduled_for);
      if (scheduledFor <= new Date())
        throw badRequest('VALIDATION_ERROR', 'Delivery must be scheduled in the future.');
      const updated = await this.updateJob(tx, job, 'DELIVERY_SCHEDULED', { scheduledFor });
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        'DELIVERY_SCHEDULED',
        'DELIVERY_SCHEDULED',
        correlationId,
        { scheduled_for: scheduledFor.toISOString() },
      );
      return { id: updated.id, status: updated.status, version: updated.version };
    });
  }

  async start(
    context: AuthorizationContext,
    jobId: string,
    input: StartDeliveryRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const accessible = await this.accessibleJob(context, jobId);
    this.assertAssignedExecutive(context, accessible);
    const replayed = await this.replay<{
      id: string;
      status: DeliveryStatus;
      tracking_expires_at: string;
      version: number;
    }>(context, 'START', { jobId, ...input }, key);
    if (replayed.found) return replayed.response;
    const readiness = await this.commercial.evaluateReadiness(
      context,
      accessible.bookingId,
      correlationId,
    );
    if (!readiness.ready)
      throw conflict('DELIVERY_READINESS_BLOCKED', 'Canonical commercial readiness is blocked.');
    return this.command(context, 'START', { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertAssignedExecutive(context, job);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, ['DELIVERY_SCHEDULED']);
      await this.assertChecklistReady(tx, cid, job.id);
      const [activeOther] = await tx
        .select({ id: schema.deliveryJobs.id })
        .from(schema.deliveryJobs)
        .where(
          and(
            eq(schema.deliveryJobs.clientOrganizationId, cid),
            eq(schema.deliveryJobs.assignedMembershipId, context.membershipId),
            eq(schema.deliveryJobs.status, 'OUT_FOR_DELIVERY'),
            sql`${schema.deliveryJobs.id} <> ${job.id}`,
          ),
        )
        .limit(1);
      if (activeOther)
        throw conflict(
          'ACTIVE_DELIVERY_EXISTS',
          'Finish the active delivery before starting another.',
        );
      const settings = await this.settings(tx, cid);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + settings.activeTimeoutMinutes * 60_000);
      const updated = await this.updateJob(tx, job, 'OUT_FOR_DELIVERY', {
        trackingActive: true,
        trackingExpiresAt: expiresAt,
        trackingStartedAt: now,
      });
      await tx.insert(schema.deliveryLocationSessions).values({
        clientOrganizationId: cid,
        deliveryJobId: job.id,
        expiresAt,
        membershipId: context.membershipId,
        startedAt: now,
        userId: context.userId,
      });
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        'OUT_FOR_DELIVERY',
        'DELIVERY_STARTED',
        correlationId,
        { disclosure_acknowledged: true, readiness_evaluated_at: readiness.evaluated_at },
      );
      return {
        id: updated.id,
        status: updated.status,
        tracking_expires_at: expiresAt.toISOString(),
        version: updated.version,
      };
    });
  }

  async locations(
    context: AuthorizationContext,
    jobId: string,
    input: RecordDeliveryLocationsRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertAssignedExecutive(context, job);
      if (job.status !== 'OUT_FOR_DELIVERY' || !job.trackingActive)
        throw conflict('TRACKING_NOT_ACTIVE', 'Location is accepted only for an active delivery.');
      const [session] = await tx
        .select()
        .from(schema.deliveryLocationSessions)
        .where(
          and(
            eq(schema.deliveryLocationSessions.clientOrganizationId, cid),
            eq(schema.deliveryLocationSessions.deliveryJobId, job.id),
            isNull(schema.deliveryLocationSessions.stoppedAt),
          ),
        )
        .limit(1);
      const now = new Date();
      if (!session || session.expiresAt <= now) {
        await this.stopTrackingTx(tx, job, 'TIMEOUT', now);
        throw conflict('TRACKING_EXPIRED', 'The delivery location session has expired.');
      }
      const settings = await this.settings(tx, cid);
      const retentionMs = settings.locationRetentionDays * 86_400_000;
      let accepted = 0;
      let latest = job.lastLocationAt;
      for (const sample of input.samples) {
        const capturedAt = new Date(sample.captured_at);
        if (capturedAt < session.startedAt || capturedAt > new Date(now.getTime() + 5 * 60_000))
          throw badRequest(
            'INVALID_LOCATION_TIME',
            'Location timestamps must be inside the active job window.',
          );
        const inserted = await tx
          .insert(schema.deliveryLocationSamples)
          .values({
            accuracyMeters: sample.accuracy_m,
            capturedAt,
            clientOrganizationId: cid,
            deliveryJobId: job.id,
            expiresAt: new Date(capturedAt.getTime() + retentionMs),
            idempotencyKey: sample.idempotency_key,
            latitude: sample.latitude,
            locationSessionId: session.id,
            longitude: sample.longitude,
          })
          .onConflictDoNothing()
          .returning({ id: schema.deliveryLocationSamples.id });
        if (inserted.length > 0) accepted += 1;
        if (!latest || capturedAt > latest) latest = capturedAt;
      }
      if (latest && (!job.lastLocationAt || latest > job.lastLocationAt))
        await tx
          .update(schema.deliveryJobs)
          .set({ lastLocationAt: latest, updatedAt: now })
          .where(eq(schema.deliveryJobs.id, job.id));
      if (accepted > 0)
        await this.record(
          tx,
          context,
          cid,
          'DELIVERY_LOCATION_BATCH_ACCEPTED',
          job.id,
          correlationId,
          { accepted, received: input.samples.length },
        );
      return { accepted, duplicates: input.samples.length - accepted };
    });
  }

  receivedBy(
    context: AuthorizationContext,
    jobId: string,
    input: RecordReceivedByProofRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'RECEIVED_BY', { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertAssignedExecutive(context, job);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, ['OUT_FOR_DELIVERY']);
      const [proof] = await tx
        .insert(schema.deliveryProofs)
        .values({
          clientOrganizationId: cid,
          deliveryJobId: job.id,
          proofType: 'RECEIVED_BY',
          receivedByName: input.received_by,
          reviewedAt: new Date(),
          reviewedByMembershipId: context.membershipId,
          status: 'VERIFIED',
        })
        .returning();
      const updated = await this.updateJob(tx, job, job.status, {});
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        job.status,
        'DELIVERY_RECEIVED_BY_RECORDED',
        correlationId,
        { proof_id: proof?.id },
      );
      return {
        id: updated.id,
        proof_id: proof?.id,
        status: updated.status,
        version: updated.version,
      };
    });
  }

  async initiateProofUpload(
    context: AuthorizationContext,
    jobId: string,
    input: InitiateDeliveryProofUploadRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const result = await this.command(
      context,
      'PROOF_INITIATE',
      { jobId, ...input },
      key,
      async (tx, cid) => {
        const job = await this.lockAndGet(tx, context, cid, jobId);
        this.assertExecutorOrManager(context, job);
        this.assertStatus(job, ['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY']);
        const proofId = randomUUID();
        const objectKey = `clients/${cid}/delivery/${job.id}/proofs/${proofId}`;
        await tx.insert(schema.deliveryProofs).values({
          checksumSha256: input.checksum_sha256,
          clientOrganizationId: cid,
          contentLength: input.content_length,
          contentType: input.content_type,
          deliveryJobId: job.id,
          fileName: input.file_name,
          id: proofId,
          objectKey,
          proofType: input.proof_type,
          status: 'PENDING_UPLOAD',
          uploadedByMembershipId: context.membershipId,
        });
        await this.record(
          tx,
          context,
          cid,
          'DELIVERY_PROOF_UPLOAD_INITIATED',
          job.id,
          correlationId,
          { proof_id: proofId, proof_type: input.proof_type },
        );
        return { object_key: objectKey, proof_id: proofId };
      },
    );
    const upload = await this.storage.createUploadUrl({
      checksumSha256: input.checksum_sha256,
      contentLength: input.content_length,
      contentType: input.content_type,
      key: result.object_key,
    });
    return {
      expires_at: upload.expiresAt,
      method: upload.method,
      proof_id: result.proof_id,
      upload_url: upload.url,
    };
  }

  async completeProofUpload(
    context: AuthorizationContext,
    jobId: string,
    input: CompleteDeliveryProofUploadRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [proof] = await this.connection.db
      .select()
      .from(schema.deliveryProofs)
      .where(
        and(
          eq(schema.deliveryProofs.clientOrganizationId, cid),
          eq(schema.deliveryProofs.deliveryJobId, jobId),
          eq(schema.deliveryProofs.id, input.proof_id),
        ),
      )
      .limit(1);
    if (!proof?.objectKey || !proof.contentType) throw notFound('Delivery proof not found.');
    await this.accessibleJob(context, jobId);
    const metadata = await this.storage.stat(proof.objectKey);
    if (
      !metadata ||
      metadata.contentLength !== proof.contentLength ||
      metadata.contentType !== proof.contentType ||
      metadata.checksumSha256 !== input.checksum_sha256 ||
      input.checksum_sha256 !== proof.checksumSha256
    )
      throw badRequest(
        'UPLOAD_METADATA_MISMATCH',
        'Uploaded proof metadata does not match initiation.',
      );
    const scan = await this.scanner.scan({
      contentType: proof.contentType,
      objectKey: proof.objectKey,
    });
    return this.command(
      context,
      'PROOF_COMPLETE',
      { jobId, ...input },
      key,
      async (tx, transactionCid) => {
        const job = await this.lockAndGet(tx, context, transactionCid, jobId);
        this.assertExecutorOrManager(context, job);
        this.assertVersion(job, input.expected_version);
        if (proof.status !== 'PENDING_UPLOAD')
          throw conflict('PROOF_ALREADY_COMPLETED', 'This proof upload is already completed.');
        const status = scan.status === 'REJECTED' ? 'REJECTED' : 'PENDING_SCAN';
        await tx
          .update(schema.deliveryProofs)
          .set({ scannerStatus: scan.status, status, uploadedAt: new Date() })
          .where(eq(schema.deliveryProofs.id, proof.id));
        const updated = await this.updateJob(tx, job, job.status, {});
        await this.appendTransition(
          tx,
          context,
          updated,
          job.status,
          job.status,
          'DELIVERY_PROOF_UPLOADED',
          correlationId,
          { proof_id: proof.id, scanner_status: scan.status, status },
          scan.reason,
        );
        return { id: updated.id, proof_status: status, version: updated.version };
      },
    );
  }

  reviewProof(
    context: AuthorizationContext,
    proofId: string,
    input: ReviewDeliveryProofRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'PROOF_REVIEW', { proofId, ...input }, key, async (tx, cid) => {
      const [proof] = await tx
        .select()
        .from(schema.deliveryProofs)
        .where(
          and(
            eq(schema.deliveryProofs.clientOrganizationId, cid),
            eq(schema.deliveryProofs.id, proofId),
          ),
        )
        .limit(1);
      if (!proof) throw notFound('Delivery proof not found.');
      const job = await this.lockAndGet(tx, context, cid, proof.deliveryJobId);
      if (input.decision === 'VERIFIED' && proof.scannerStatus !== 'CLEAN')
        throw conflict('PROOF_SCAN_REQUIRED', 'Only clean scanned proof can be verified.');
      if (!['PENDING_SCAN', 'REJECTED'].includes(proof.status))
        throw conflict('PROOF_REVIEW_INVALID', 'This proof is not awaiting review.');
      await tx
        .update(schema.deliveryProofs)
        .set({
          reviewReason: input.reason,
          reviewedAt: new Date(),
          reviewedByMembershipId: context.membershipId,
          status: input.decision,
        })
        .where(eq(schema.deliveryProofs.id, proof.id));
      await this.record(
        tx,
        context,
        cid,
        `DELIVERY_PROOF_${input.decision}`,
        job.id,
        correlationId,
        { proof_id: proof.id, proof_type: proof.proofType },
        input.reason,
      );
      return { proof_id: proof.id, status: input.decision };
    });
  }

  async proofDownload(
    context: AuthorizationContext,
    proofId: string,
    purpose: string,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [proof] = await this.connection.db
      .select()
      .from(schema.deliveryProofs)
      .where(
        and(
          eq(schema.deliveryProofs.clientOrganizationId, cid),
          eq(schema.deliveryProofs.id, proofId),
        ),
      )
      .limit(1);
    if (!proof?.objectKey) throw notFound('Downloadable delivery proof not found.');
    if (proof.scannerStatus !== 'CLEAN')
      throw conflict(
        'PROOF_SCAN_REQUIRED',
        'Delivery proof download is blocked until malware scanning reports CLEAN.',
      );
    await this.accessibleJob(context, proof.deliveryJobId);
    const download = await this.storage.createDownloadUrl({
      ...(proof.fileName ? { downloadFileName: proof.fileName } : {}),
      key: proof.objectKey,
    });
    await this.connection.db.transaction(async (tx) => {
      await tx.insert(schema.deliveryProofDownloadEvents).values({
        actorMembershipId: context.membershipId,
        clientOrganizationId: cid,
        correlationId,
        deliveryJobId: proof.deliveryJobId,
        deliveryProofId: proof.id,
        purpose,
      });
      await this.record(
        tx,
        context,
        cid,
        'DELIVERY_PROOF_DOWNLOADED',
        proof.deliveryJobId,
        correlationId,
        { proof_id: proof.id, purpose },
      );
    });
    return { download_url: download.url, expires_at: download.expiresAt };
  }

  async requestOtp(
    context: AuthorizationContext,
    jobId: string,
    input: RequestDeliveryOtpRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const job = await this.accessibleJob(context, jobId);
    this.assertAssignedExecutive(context, job);
    this.assertVersion(job, input.expected_version);
    this.assertStatus(job, ['OUT_FOR_DELIVERY']);
    const [contact] = await this.connection.db
      .select({ phone: schema.contacts.primaryPhoneE164 })
      .from(schema.contacts)
      .where(
        and(eq(schema.contacts.clientOrganizationId, cid), eq(schema.contacts.id, job.contactId)),
      )
      .limit(1);
    if (!contact) throw notFound('Customer contact not found.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = new Date();
    const [challenge] = await this.connection.db
      .insert(schema.deliveryOtpChallenges)
      .values({
        clientOrganizationId: cid,
        codeHash: this.otpHash(cid, job.id, code),
        deliveryJobId: job.id,
        expiresAt: new Date(now.getTime() + 10 * 60_000),
      })
      .returning();
    if (!challenge) throw new Error('OTP challenge insert did not return a row.');
    try {
      await this.otpSender.send({
        clientOrganizationId: cid,
        code,
        deliveryJobId: job.id,
        phoneE164: contact.phone,
      });
    } catch (error) {
      await this.connection.db
        .update(schema.deliveryOtpChallenges)
        .set({ consumedAt: new Date() })
        .where(eq(schema.deliveryOtpChallenges.id, challenge.id));
      throw error;
    }
    await this.connection.db.transaction((tx) =>
      this.record(tx, context, cid, 'DELIVERY_OTP_REQUESTED', job.id, correlationId, {
        challenge_id: challenge.id,
        expires_at: challenge.expiresAt.toISOString(),
      }),
    );
    return { expires_at: challenge.expiresAt.toISOString() };
  }

  verifyOtp(
    context: AuthorizationContext,
    jobId: string,
    input: VerifyDeliveryOtpRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'OTP_VERIFY', { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertAssignedExecutive(context, job);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, ['OUT_FOR_DELIVERY']);
      const [challenge] = await tx
        .select()
        .from(schema.deliveryOtpChallenges)
        .where(
          and(
            eq(schema.deliveryOtpChallenges.clientOrganizationId, cid),
            eq(schema.deliveryOtpChallenges.deliveryJobId, job.id),
            isNull(schema.deliveryOtpChallenges.consumedAt),
          ),
        )
        .orderBy(desc(schema.deliveryOtpChallenges.createdAt))
        .limit(1);
      if (!challenge || challenge.expiresAt <= new Date() || challenge.attempts >= 5)
        throw badRequest('OTP_INVALID', 'The delivery OTP is invalid or expired.');
      const codeHash = this.otpHash(cid, job.id, input.code);
      if (codeHash !== challenge.codeHash) {
        await tx
          .update(schema.deliveryOtpChallenges)
          .set({ attempts: challenge.attempts + 1 })
          .where(eq(schema.deliveryOtpChallenges.id, challenge.id));
        throw badRequest('OTP_INVALID', 'The delivery OTP is invalid or expired.');
      }
      await tx
        .update(schema.deliveryOtpChallenges)
        .set({ consumedAt: new Date() })
        .where(eq(schema.deliveryOtpChallenges.id, challenge.id));
      const [proof] = await tx
        .insert(schema.deliveryProofs)
        .values({
          clientOrganizationId: cid,
          deliveryJobId: job.id,
          proofType: 'OTP',
          reviewedAt: new Date(),
          reviewedByMembershipId: context.membershipId,
          status: 'VERIFIED',
          valueHash: codeHash,
        })
        .returning();
      const updated = await this.updateJob(tx, job, job.status, {});
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        job.status,
        'DELIVERY_OTP_VERIFIED',
        correlationId,
        { proof_id: proof?.id },
      );
      return { id: job.id, proof_id: proof?.id, version: updated.version };
    });
  }

  complete(
    context: AuthorizationContext,
    jobId: string,
    input: CompleteDeliveryRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'COMPLETE', { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertAssignedExecutive(context, job);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, ['OUT_FOR_DELIVERY']);
      await this.assertChecklistReady(tx, cid, job.id);
      const settings = await this.settings(tx, cid);
      if (input.received_by) {
        await tx
          .insert(schema.deliveryProofs)
          .values({
            clientOrganizationId: cid,
            deliveryJobId: job.id,
            proofType: 'RECEIVED_BY',
            receivedByName: input.received_by,
            reviewedAt: new Date(),
            reviewedByMembershipId: context.membershipId,
            status: 'VERIFIED',
          })
          .onConflictDoNothing();
      }
      const verified = await tx
        .select({ proofType: schema.deliveryProofs.proofType })
        .from(schema.deliveryProofs)
        .where(
          and(
            eq(schema.deliveryProofs.clientOrganizationId, cid),
            eq(schema.deliveryProofs.deliveryJobId, job.id),
            eq(schema.deliveryProofs.status, 'VERIFIED'),
          ),
        );
      const types = new Set(verified.map((entry) => entry.proofType));
      const missing = settings.requiredProofTypes.filter((type) => !types.has(type as never));
      if (missing.length > 0)
        throw conflict(
          'DELIVERY_PROOF_REQUIRED',
          `Configured delivery proof is missing: ${missing.join(', ')}.`,
        );
      const now = new Date();
      await this.stopTrackingTx(tx, job, 'COMPLETED', now);
      const updated = await this.updateJob(tx, job, 'DELIVERED', {
        deliveredAt: now,
        trackingActive: false,
      });
      const [allocation] = await tx
        .select()
        .from(schema.inventoryAllocations)
        .where(
          and(
            eq(schema.inventoryAllocations.clientOrganizationId, cid),
            eq(schema.inventoryAllocations.inventoryUnitId, job.inventoryUnitId),
            eq(schema.inventoryAllocations.bookingId, job.bookingId),
            eq(schema.inventoryAllocations.status, 'ACTIVE'),
          ),
        )
        .limit(1);
      if (!allocation)
        throw conflict(
          'INVENTORY_ALLOCATION_REQUIRED',
          'Delivery requires the active booking allocation.',
        );
      const [unit] = await tx
        .select()
        .from(schema.inventoryUnits)
        .where(
          and(
            eq(schema.inventoryUnits.clientOrganizationId, cid),
            eq(schema.inventoryUnits.id, job.inventoryUnitId),
          ),
        )
        .limit(1);
      if (!unit || unit.status !== 'ALLOCATED')
        throw conflict(
          'INVENTORY_STATUS_INVALID',
          'Only the allocated physical unit can be delivered.',
        );
      await tx
        .update(schema.inventoryAllocations)
        .set({ releasedAt: now, status: 'DELIVERED' })
        .where(eq(schema.inventoryAllocations.id, allocation.id));
      await tx
        .update(schema.inventoryUnits)
        .set({ status: 'DELIVERED', updatedAt: now, version: unit.version + 1 })
        .where(eq(schema.inventoryUnits.id, unit.id));
      await tx.insert(schema.inventoryUnitStatusHistory).values({
        actorMembershipId: context.membershipId,
        actorUserId: context.userId,
        clientOrganizationId: cid,
        evidence: { booking_id: job.bookingId, delivery_job_id: job.id },
        eventType: 'UNIT_DELIVERED',
        fromStatus: unit.status,
        inventoryUnitId: unit.id,
        toStatus: 'DELIVERED',
      });
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        'DELIVERED',
        'DELIVERY_COMPLETED',
        correlationId,
        { proof_types: [...types] },
      );
      return {
        delivered_at: now.toISOString(),
        id: updated.id,
        status: updated.status,
        version: updated.version,
      };
    });
  }

  delay(
    context: AuthorizationContext,
    jobId: string,
    input: DeliveryExceptionRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.exception(context, jobId, input, key, correlationId, 'DELAYED');
  }

  fail(
    context: AuthorizationContext,
    jobId: string,
    input: DeliveryExceptionRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.exception(context, jobId, input, key, correlationId, 'FAILED');
  }

  cancel(
    context: AuthorizationContext,
    jobId: string,
    input: DeliveryExceptionRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(context, 'CANCEL', { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, [
        'VEHICLE_ALLOCATED',
        'VEHICLE_PREPARATION',
        'READY_FOR_DELIVERY',
        'DELIVERY_SCHEDULED',
        'DELAYED',
        'FAILED',
        'RESCHEDULED',
      ]);
      const now = new Date();
      await this.stopTrackingTx(tx, job, 'CANCELLED', now);
      const updated = await this.updateJob(tx, job, 'CANCELLED', {
        cancelledAt: now,
        exceptionReason: input.reason,
        trackingActive: false,
      });
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        'CANCELLED',
        'DELIVERY_CANCELLED',
        correlationId,
        {},
        input.reason,
      );
      return { id: updated.id, status: updated.status, version: updated.version };
    });
  }

  requestReschedule(
    context: AuthorizationContext,
    jobId: string,
    input: RequestDeliveryReschedule,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'RESCHEDULE_REQUEST',
      { jobId, ...input },
      key,
      async (tx, cid) => {
        const job = await this.lockAndGet(tx, context, cid, jobId);
        this.assertExecutorOrManager(context, job);
        this.assertVersion(job, input.expected_version);
        this.assertStatus(job, ['DELIVERY_SCHEDULED', 'DELAYED', 'FAILED']);
        const requestedFor = new Date(input.requested_for);
        if (requestedFor <= new Date())
          throw badRequest(
            'VALIDATION_ERROR',
            'The requested delivery time must be in the future.',
          );
        await this.stopTrackingTx(tx, job, 'RESCHEDULED', new Date());
        const updated = await this.updateJob(tx, job, 'RESCHEDULED', {
          exceptionReason: input.reason,
          requestedScheduleAt: requestedFor,
          rescheduleStatus: 'PENDING',
          trackingActive: false,
        });
        await this.appendTransition(
          tx,
          context,
          updated,
          job.status,
          'RESCHEDULED',
          'DELIVERY_RESCHEDULE_REQUESTED',
          correlationId,
          { requested_for: requestedFor.toISOString() },
          input.reason,
        );
        return { id: updated.id, status: updated.status, version: updated.version };
      },
    );
  }

  decideReschedule(
    context: AuthorizationContext,
    jobId: string,
    input: DecideDeliveryReschedule,
    key: string | undefined,
    correlationId: string,
  ) {
    return this.command(
      context,
      'RESCHEDULE_DECISION',
      { jobId, ...input },
      key,
      async (tx, cid) => {
        const job = await this.lockAndGet(tx, context, cid, jobId);
        this.assertVersion(job, input.expected_version);
        this.assertStatus(job, ['RESCHEDULED']);
        if (job.rescheduleStatus !== 'PENDING' || !job.requestedScheduleAt)
          throw conflict('RESCHEDULE_NOT_PENDING', 'No reschedule approval is pending.');
        const target: DeliveryStatus =
          input.decision === 'APPROVED' ? 'DELIVERY_SCHEDULED' : 'FAILED';
        const updated = await this.updateJob(tx, job, target, {
          rescheduleStatus: input.decision,
          scheduledFor: input.decision === 'APPROVED' ? job.requestedScheduleAt : job.scheduledFor,
        });
        await this.appendTransition(
          tx,
          context,
          updated,
          job.status,
          target,
          `DELIVERY_RESCHEDULE_${input.decision}`,
          correlationId,
          { requested_for: job.requestedScheduleAt.toISOString() },
          input.reason,
        );
        return { id: updated.id, status: updated.status, version: updated.version };
      },
    );
  }

  async reconcile(context: AuthorizationContext, correlationId: string) {
    const cid = clientId(context);
    const expired = await this.expireTracking(cid, new Date(), correlationId, context);
    const purged = await this.connection.db
      .delete(schema.deliveryLocationSamples)
      .where(lte(schema.deliveryLocationSamples.expiresAt, new Date()))
      .returning({ id: schema.deliveryLocationSamples.id });
    return { expired_sessions: expired, purged_samples: purged.length };
  }

  private exception(
    context: AuthorizationContext,
    jobId: string,
    input: DeliveryExceptionRequest,
    key: string | undefined,
    correlationId: string,
    target: 'DELAYED' | 'FAILED',
  ) {
    return this.command(context, target, { jobId, ...input }, key, async (tx, cid) => {
      const job = await this.lockAndGet(tx, context, cid, jobId);
      this.assertExecutorOrManager(context, job);
      this.assertVersion(job, input.expected_version);
      this.assertStatus(job, ['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY']);
      const now = new Date();
      await this.stopTrackingTx(tx, job, target, now);
      const updated = await this.updateJob(tx, job, target, {
        exceptionReason: input.reason,
        trackingActive: false,
      });
      await this.appendTransition(
        tx,
        context,
        updated,
        job.status,
        target,
        `DELIVERY_${target}`,
        correlationId,
        {},
        input.reason,
      );
      return { id: updated.id, status: updated.status, version: updated.version };
    });
  }

  private async command<T extends Record<string, unknown>>(
    context: AuthorizationContext,
    commandType: string,
    input: unknown,
    key: string | undefined,
    operation: (tx: Tx, cid: string) => Promise<T>,
  ): Promise<T> {
    const cid = clientId(context);
    const idempotencyKey = requiredKey(key);
    const requestFingerprint = fingerprint({ commandType, input });
    try {
      return await this.connection.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(schema.deliveryCommandReceipts)
          .values({
            clientOrganizationId: cid,
            commandType,
            idempotencyKey,
            requestFingerprint,
            responseSnapshot: {},
          })
          .onConflictDoNothing()
          .returning({ id: schema.deliveryCommandReceipts.id });
        if (inserted.length === 0) {
          const [receipt] = await tx
            .select()
            .from(schema.deliveryCommandReceipts)
            .where(
              and(
                eq(schema.deliveryCommandReceipts.clientOrganizationId, cid),
                eq(schema.deliveryCommandReceipts.idempotencyKey, idempotencyKey),
              ),
            )
            .limit(1);
          if (
            !receipt ||
            receipt.commandType !== commandType ||
            receipt.requestFingerprint !== requestFingerprint
          )
            throw conflict(
              'IDEMPOTENCY_MISMATCH',
              'This idempotency key was used for another delivery command.',
            );
          return receipt.responseSnapshot as T;
        }
        const response = await operation(tx, cid);
        const receiptId = inserted[0]?.id;
        if (!receiptId) throw new Error('Delivery receipt insert did not return an ID.');
        await tx
          .update(schema.deliveryCommandReceipts)
          .set({ responseSnapshot: response })
          .where(eq(schema.deliveryCommandReceipts.id, receiptId));
        return response;
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        throw error;
      if (databaseCode(error) === '23505')
        throw conflict(
          'DELIVERY_CONFLICT',
          'The delivery workflow already exists or changed concurrently.',
        );
      throw error;
    }
  }

  private async replay<T extends Record<string, unknown>>(
    context: AuthorizationContext,
    commandType: string,
    input: unknown,
    key: string | undefined,
  ): Promise<{ found: false } | { found: true; response: T }> {
    const cid = clientId(context);
    const idempotencyKey = requiredKey(key);
    const requestFingerprint = fingerprint({ commandType, input });
    const [receipt] = await this.connection.db
      .select()
      .from(schema.deliveryCommandReceipts)
      .where(
        and(
          eq(schema.deliveryCommandReceipts.clientOrganizationId, cid),
          eq(schema.deliveryCommandReceipts.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!receipt) return { found: false };
    if (receipt.commandType !== commandType || receipt.requestFingerprint !== requestFingerprint)
      throw conflict(
        'IDEMPOTENCY_MISMATCH',
        'This idempotency key was used for another delivery command.',
      );
    return { found: true, response: receipt.responseSnapshot as T };
  }

  private async lockAndGet(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    jobId: string,
  ): Promise<Job> {
    await this.lock(tx, schema.deliveryJobs, cid, jobId);
    const [job] = await tx
      .select()
      .from(schema.deliveryJobs)
      .where(
        and(eq(schema.deliveryJobs.clientOrganizationId, cid), eq(schema.deliveryJobs.id, jobId)),
      )
      .limit(1);
    if (!job || !this.canAccess(context, job)) throw notFound('Delivery job not found.');
    return job;
  }

  private async accessibleJob(context: AuthorizationContext, jobId: string): Promise<Job> {
    const cid = clientId(context);
    const [job] = await this.connection.db
      .select()
      .from(schema.deliveryJobs)
      .where(
        and(eq(schema.deliveryJobs.clientOrganizationId, cid), eq(schema.deliveryJobs.id, jobId)),
      )
      .limit(1);
    if (!job || !this.canAccess(context, job)) throw notFound('Delivery job not found.');
    return job;
  }

  private canAccess(context: AuthorizationContext, job: Job): boolean {
    return this.policy.canAccessResource(context, {
      assigneeId: job.assignedUserId,
      branchId: job.branchId,
      clientOrganizationId: job.clientOrganizationId,
    });
  }

  private async eligibleExecutive(
    context: AuthorizationContext,
    branchId: string,
    membershipId: string,
  ) {
    const eligible = (await this.executives(context, branchId)).executives.find(
      (candidate) => candidate.membership_id === membershipId,
    );
    if (!eligible)
      throw badRequest(
        'VALIDATION_ERROR',
        'The selected delivery executive is not eligible for this branch.',
      );
    return eligible;
  }

  private assertAssignedExecutive(context: AuthorizationContext, job: Job): void {
    if (job.assignedMembershipId !== context.membershipId || job.assignedUserId !== context.userId)
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: [],
        message: 'Only the assigned delivery executive can perform this action.',
        retryable: false,
      });
  }

  private assertExecutorOrManager(context: AuthorizationContext, job: Job): void {
    if (context.roleCode === 'DELIVERY_EXECUTIVE') this.assertAssignedExecutive(context, job);
  }

  private assertVersion(job: Job, expected: number): void {
    if (job.version !== expected)
      throw conflict('CONCURRENT_UPDATE', 'The delivery changed; refresh before retrying.');
  }

  private assertStatus(job: Job, statuses: DeliveryStatus[]): void {
    if (!statuses.includes(job.status))
      throw conflict(
        'INVALID_DELIVERY_TRANSITION',
        `Delivery status ${job.status} is not valid for this action.`,
      );
  }

  private async assertChecklistReady(tx: Tx, cid: string, jobId: string): Promise<void> {
    const incomplete = await tx
      .select({ code: schema.deliveryChecklistItems.code })
      .from(schema.deliveryChecklistItems)
      .where(
        and(
          eq(schema.deliveryChecklistItems.clientOrganizationId, cid),
          eq(schema.deliveryChecklistItems.deliveryJobId, jobId),
          eq(schema.deliveryChecklistItems.required, true),
          eq(schema.deliveryChecklistItems.checked, false),
        ),
      );
    if (incomplete.length > 0)
      throw conflict(
        'DELIVERY_CHECKLIST_BLOCKED',
        `Required preparation is incomplete: ${incomplete.map((item) => item.code).join(', ')}.`,
      );
  }

  private async settings(tx: Tx | DatabaseConnection['db'], cid: string) {
    await tx
      .insert(schema.deliverySettings)
      .values({ clientOrganizationId: cid })
      .onConflictDoNothing();
    const [settings] = await tx
      .select()
      .from(schema.deliverySettings)
      .where(eq(schema.deliverySettings.clientOrganizationId, cid))
      .limit(1);
    if (!settings) throw new Error('Delivery settings could not be resolved.');
    return settings;
  }

  private presentSettings(settings: typeof schema.deliverySettings.$inferSelect) {
    return {
      active_timeout_minutes: settings.activeTimeoutMinutes,
      location_retention_days: settings.locationRetentionDays,
      location_stale_seconds: settings.locationStaleSeconds,
      required_checklist_codes: settings.requiredChecklistCodes,
      required_proof_types: settings.requiredProofTypes,
      updated_at: settings.updatedAt.toISOString(),
      version: settings.version,
    };
  }

  private async updateJob(
    tx: Tx,
    job: Job,
    status: DeliveryStatus,
    values: Partial<typeof schema.deliveryJobs.$inferInsert>,
  ): Promise<Job> {
    const [updated] = await tx
      .update(schema.deliveryJobs)
      .set({ ...values, status, updatedAt: new Date(), version: job.version + 1 })
      .where(
        and(
          eq(schema.deliveryJobs.clientOrganizationId, job.clientOrganizationId),
          eq(schema.deliveryJobs.id, job.id),
          eq(schema.deliveryJobs.version, job.version),
        ),
      )
      .returning();
    if (!updated) throw conflict('CONCURRENT_UPDATE', 'The delivery changed concurrently.');
    return updated;
  }

  private async appendTransition(
    tx: Tx,
    context: AuthorizationContext,
    job: Job,
    fromStatus: DeliveryStatus | null,
    toStatus: DeliveryStatus,
    eventType: string,
    correlationId: string,
    evidence: Record<string, unknown>,
    reason?: string,
  ) {
    await tx.insert(schema.deliveryStatusEvents).values({
      actorMembershipId: context.membershipId,
      clientOrganizationId: job.clientOrganizationId,
      correlationId,
      deliveryJobId: job.id,
      eventType,
      evidence,
      fromStatus,
      reason,
      toStatus,
    });
    await this.record(
      tx,
      context,
      job.clientOrganizationId,
      eventType,
      job.id,
      correlationId,
      { ...evidence, from_status: fromStatus, status: toStatus, version: job.version },
      reason,
    );
  }

  private async record(
    tx: Tx,
    context: AuthorizationContext,
    cid: string,
    action: string,
    jobId: string,
    correlationId: string,
    summary: Record<string, unknown>,
    reason?: string,
    entityType = 'DELIVERY_JOB',
  ) {
    await tx.insert(schema.outboxEvents).values({
      aggregateId: jobId,
      aggregateType: entityType,
      clientOrganizationId: cid,
      correlationId,
      eventType: action,
      payload: summary,
      scope: 'CLIENT',
    });
    await tx.insert(schema.auditEvents).values({
      action,
      actorId: context.userId,
      actorType: 'USER',
      clientOrganizationId: cid,
      correlationId,
      effectiveRole: context.roleCode,
      entityId: jobId,
      entityType,
      newSummary: summary,
      outcome: 'SUCCESS',
      reason,
      scope: 'CLIENT',
    });
  }

  private async stopTrackingTx(tx: Tx, job: Job, reason: string, now: Date): Promise<void> {
    if (!job.trackingActive) return;
    await tx
      .update(schema.deliveryLocationSessions)
      .set({ stopReason: reason, stoppedAt: now })
      .where(
        and(
          eq(schema.deliveryLocationSessions.clientOrganizationId, job.clientOrganizationId),
          eq(schema.deliveryLocationSessions.deliveryJobId, job.id),
          isNull(schema.deliveryLocationSessions.stoppedAt),
        ),
      );
  }

  private async expireTracking(
    cid: string,
    now: Date,
    correlationId: string,
    context?: AuthorizationContext,
  ): Promise<number> {
    const expired = await this.connection.db
      .select()
      .from(schema.deliveryJobs)
      .where(
        and(
          eq(schema.deliveryJobs.clientOrganizationId, cid),
          eq(schema.deliveryJobs.trackingActive, true),
          lte(schema.deliveryJobs.trackingExpiresAt, now),
        ),
      );
    for (const job of expired) {
      await this.connection.db.transaction(async (tx) => {
        await this.stopTrackingTx(tx, job, 'TIMEOUT', now);
        const updated = await this.updateJob(tx, job, 'DELAYED', {
          exceptionReason: 'Active delivery tracking timed out.',
          trackingActive: false,
        });
        if (context)
          await this.appendTransition(
            tx,
            context,
            updated,
            job.status,
            'DELAYED',
            'DELIVERY_TRACKING_TIMEOUT',
            correlationId,
            {},
            'Active delivery tracking timed out.',
          );
        else
          await tx.insert(schema.deliveryStatusEvents).values({
            clientOrganizationId: cid,
            correlationId,
            deliveryJobId: job.id,
            eventType: 'DELIVERY_TRACKING_TIMEOUT',
            evidence: {},
            fromStatus: job.status,
            reason: 'Active delivery tracking timed out.',
            toStatus: 'DELAYED',
          });
      });
    }
    return expired.length;
  }

  private async latestLocations(cid: string, jobIds: string[]) {
    const result = new Map<
      string,
      {
        accuracy_m: number;
        captured_at: string;
        latitude: number;
        longitude: number;
        stale: boolean;
      }
    >();
    if (jobIds.length === 0) return result;
    const settings = await this.settings(this.connection.db, cid);
    const rows = await this.connection.db
      .select()
      .from(schema.deliveryLocationSamples)
      .where(
        and(
          eq(schema.deliveryLocationSamples.clientOrganizationId, cid),
          inArray(schema.deliveryLocationSamples.deliveryJobId, jobIds),
        ),
      )
      .orderBy(desc(schema.deliveryLocationSamples.capturedAt));
    const now = Date.now();
    for (const row of rows) {
      if (result.has(row.deliveryJobId)) continue;
      result.set(row.deliveryJobId, {
        accuracy_m: row.accuracyMeters,
        captured_at: row.capturedAt.toISOString(),
        latitude: row.latitude,
        longitude: row.longitude,
        stale: now - row.capturedAt.getTime() > settings.locationStaleSeconds * 1000,
      });
    }
    return result;
  }

  private async summaryRow(cid: string, jobId: string) {
    const [row] = await this.connection.db
      .select({
        assignedName: schema.users.displayName,
        bookingReference: schema.bookings.bookingReference,
        brandName: schema.inventoryBrands.name,
        contact: schema.contacts,
        job: schema.deliveryJobs,
        modelName: schema.inventoryModels.name,
        unitReference: schema.inventoryUnits.unitReference,
        variantName: schema.inventoryVariants.name,
      })
      .from(schema.deliveryJobs)
      .innerJoin(schema.bookings, eq(schema.bookings.id, schema.deliveryJobs.bookingId))
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.deliveryJobs.contactId))
      .innerJoin(
        schema.inventoryUnits,
        eq(schema.inventoryUnits.id, schema.deliveryJobs.inventoryUnitId),
      )
      .innerJoin(
        schema.inventoryVariants,
        eq(schema.inventoryVariants.id, schema.inventoryUnits.variantId),
      )
      .innerJoin(
        schema.inventoryModels,
        eq(schema.inventoryModels.id, schema.inventoryVariants.modelId),
      )
      .innerJoin(
        schema.inventoryBrands,
        eq(schema.inventoryBrands.id, schema.inventoryModels.brandId),
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.deliveryJobs.assignedUserId))
      .where(
        and(eq(schema.deliveryJobs.clientOrganizationId, cid), eq(schema.deliveryJobs.id, jobId)),
      )
      .limit(1);
    return row;
  }

  private presentSummary(
    row: NonNullable<Awaited<ReturnType<DeliveryService['summaryRow']>>>,
    location: {
      accuracy_m: number;
      captured_at: string;
      latitude: number;
      longitude: number;
      stale: boolean;
    } | null,
  ) {
    return {
      assigned_membership_id: row.job.assignedMembershipId,
      assigned_name: row.assignedName,
      booking_id: row.job.bookingId,
      booking_reference: row.bookingReference,
      branch_id: row.job.branchId,
      contact_id: row.job.contactId,
      customer_name: row.contact.displayName,
      destination_address: row.job.destinationAddress,
      destination_latitude: row.job.destinationLatitude,
      destination_longitude: row.job.destinationLongitude,
      id: row.job.id,
      inventory_unit_id: row.job.inventoryUnitId,
      last_location: location,
      lead_id: row.job.leadId,
      phone_e164: row.contact.primaryPhoneE164,
      scheduled_for: row.job.scheduledFor.toISOString(),
      status: row.job.status,
      tracking_active: row.job.trackingActive,
      vehicle_label: `${row.brandName} ${row.modelName} ${row.variantName} · ${row.unitReference}`,
      version: row.job.version,
    };
  }

  private otpHash(cid: string, jobId: string, code: string): string {
    return createHmac('sha256', this.config.otpPepper)
      .update(`${cid}:${jobId}:${code}`, 'utf8')
      .digest('hex');
  }

  private lock(tx: Tx, table: PgTable, cid: string, id: string) {
    return tx.execute(
      sql`select id from ${table} where client_organization_id = ${cid} and id = ${id} for update`,
    );
  }
}
