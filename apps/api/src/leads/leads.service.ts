/* Domain commands deliberately share one transaction for state, history, audit and outbox. */
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-non-null-assertion */
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AssignLeadRequest,
  CompleteFollowUpRequest,
  CompleteLeadTaskRequest,
  CreateFollowUpRequest,
  CreateLeadNoteRequest,
  CreateLeadRequest,
  CreateLeadTaskRequest,
  LeadListQuery,
  LeadTransitionRequest,
  PublicLeadFormRequest,
  ResolveDuplicateRequest,
  UpdateLeadSlaSettingsRequest,
} from '@gdm/contracts';
import { type DatabaseConnection, schema } from '@gdm/database';
import { and, asc, count, desc, eq, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import { isAllowedLeadTransition, requiresNextAction } from './lead-lifecycle.js';
import { LEADS_RUNTIME_CONFIG, type LeadsRuntimeConfig } from './leads-runtime-config.js';
import { normalizeIndianPhone, phoneLookupHash } from './phone-normalizer.js';
import { businessSlaDeadline, isWithinWorkingHours } from './sla-calculator.js';

type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];
type LeadRow = typeof schema.leadOpportunities.$inferSelect;

function clientId(context: AuthorizationContext): string {
  if (!context.clientOrganizationId)
    throw new ForbiddenException({
      code: 'SUPPORT_ELEVATION_REQUIRED',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  return context.clientOrganizationId;
}
function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });
}
function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, details: [], message, retryable: false });
}
function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const value = error as { cause?: unknown; code?: unknown };
  return value.code === '23505' || isUniqueViolation(value.cause);
}
function requiredIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length > 256)
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      details: [
        { field: 'Idempotency-Key', reason: 'A key of at most 256 characters is required.' },
      ],
      message: 'Idempotency-Key is required.',
      retryable: false,
    });
  return key;
}

@Injectable()
export class LeadsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(LEADS_RUNTIME_CONFIG) private readonly config: LeadsRuntimeConfig,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
  ) {}

  async createManual(
    context: AuthorizationContext,
    body: CreateLeadRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    if (!this.policy.canAccessBranch(context, body.branch_id))
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [{ field: 'branch_id', reason: 'Outside effective branch scope.' }],
        message: 'The selected branch is outside your scope.',
        retryable: false,
      });
    return this.createLead({
      actor: context,
      body,
      clientOrganizationId: clientId(context),
      correlationId,
      entryMethod: 'MANUAL',
      idempotencyKey: requiredIdempotencyKey(idempotencyKey),
      provider: `MANUAL:${context.membershipId}`,
    });
  }

  async createPublic(
    form: typeof schema.publicLeadForms.$inferSelect,
    body: PublicLeadFormRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    return this.createLead({
      body: { ...body, branch_id: form.branchId, assignment_queue_id: form.assignmentQueueId },
      clientOrganizationId: form.clientOrganizationId,
      correlationId,
      entryMethod: 'PUBLIC_FORM',
      idempotencyKey: requiredIdempotencyKey(idempotencyKey),
      provider: `PUBLIC_FORM:${form.id}`,
    });
  }

  async publicForm(formKey: string) {
    const [form] = await this.connection.db
      .select()
      .from(schema.publicLeadForms)
      .where(
        and(
          eq(schema.publicLeadForms.clientFormKey, formKey),
          eq(schema.publicLeadForms.active, true),
        ),
      )
      .limit(1);
    if (!form) throw notFound('This lead form is unavailable.');
    return form;
  }

  private async createLead(input: {
    actor?: AuthorizationContext;
    body: CreateLeadRequest;
    clientOrganizationId: string;
    correlationId: string;
    entryMethod: 'MANUAL' | 'PUBLIC_FORM';
    idempotencyKey: string;
    provider: string;
  }) {
    const phone = normalizeIndianPhone(input.body.phone);
    const alternate = input.body.alternate_phone
      ? normalizeIndianPhone(input.body.alternate_phone)
      : null;
    if (!phone || (input.body.alternate_phone && !alternate))
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'phone', reason: 'A valid Indian mobile number is required.' }],
        message: 'Phone validation failed.',
        retryable: false,
      });
    const requestHash = fingerprint(input.body);
    const phoneHash = phoneLookupHash(
      input.clientOrganizationId,
      phone,
      this.config.phoneLookupPepper,
    );
    const alternateHash = alternate
      ? phoneLookupHash(input.clientOrganizationId, alternate, this.config.phoneLookupPepper)
      : null;

    try {
      return await this.connection.db.transaction(async (tx) => {
        const [receipt] = await tx
          .select()
          .from(schema.leadIngestionReceipts)
          .where(
            and(
              eq(schema.leadIngestionReceipts.clientOrganizationId, input.clientOrganizationId),
              eq(schema.leadIngestionReceipts.provider, input.provider),
              eq(schema.leadIngestionReceipts.externalEventId, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (receipt) {
          if (receipt.requestFingerprint !== requestHash)
            throw conflict(
              'IDEMPOTENCY_MISMATCH',
              'This idempotency key was used for another request.',
            );
          return { ...(receipt.responseSnapshot ?? {}), replayed: true };
        }

        const [branch] = await tx
          .select()
          .from(schema.branches)
          .where(
            and(
              eq(schema.branches.clientOrganizationId, input.clientOrganizationId),
              eq(schema.branches.id, input.body.branch_id),
              eq(schema.branches.active, true),
            ),
          )
          .limit(1);
        if (!branch) throw notFound('The selected active branch was not found.');
        if (input.body.assignment_queue_id) {
          const [requestedQueue] = await tx
            .select()
            .from(schema.assignmentQueues)
            .where(
              and(
                eq(schema.assignmentQueues.clientOrganizationId, input.clientOrganizationId),
                eq(schema.assignmentQueues.id, input.body.assignment_queue_id),
                eq(schema.assignmentQueues.branchId, branch.id),
                eq(schema.assignmentQueues.active, true),
              ),
            )
            .limit(1);
          const sourceEligible =
            requestedQueue &&
            (requestedQueue.sourceRules.length === 0 ||
              requestedQueue.sourceRules.includes(input.body.source));
          const languageEligible =
            requestedQueue &&
            (requestedQueue.languageRules.length === 0 ||
              (input.body.language !== null &&
                input.body.language !== undefined &&
                requestedQueue.languageRules.includes(input.body.language)));
          if (!sourceEligible || !languageEligible)
            throw new BadRequestException({
              code: 'VALIDATION_ERROR',
              details: [
                {
                  field: 'assignment_queue_id',
                  reason: 'Queue is inactive, out of branch, or does not match source/language.',
                },
              ],
              message: 'The selected assignment queue is unavailable.',
              retryable: false,
            });
        }

        const [exactContact] = await tx
          .select()
          .from(schema.contacts)
          .where(
            and(
              eq(schema.contacts.clientOrganizationId, input.clientOrganizationId),
              or(
                eq(schema.contacts.primaryPhoneLookupHash, phoneHash),
                eq(schema.contacts.alternatePhoneLookupHash, phoneHash),
              ),
            ),
          )
          .limit(1);
        const normalizedEmail = input.body.email?.trim().toLowerCase() ?? null;
        const [emailCandidate] = normalizedEmail
          ? await tx
              .select()
              .from(schema.contacts)
              .where(
                and(
                  eq(schema.contacts.clientOrganizationId, input.clientOrganizationId),
                  eq(schema.contacts.primaryEmailNormalized, normalizedEmail),
                ),
              )
              .limit(1)
          : [];

        let contact = exactContact;
        let duplicateCandidate = false;
        if (!contact) {
          [contact] = await tx
            .insert(schema.contacts)
            .values({
              alternatePhoneE164: alternate,
              alternatePhoneLookupHash: alternateHash,
              clientOrganizationId: input.clientOrganizationId,
              displayName: input.body.name,
              primaryEmailNormalized: normalizedEmail,
              primaryPhoneE164: phone,
              primaryPhoneLookupHash: phoneHash,
            })
            .returning();
          await tx.insert(schema.contactChannels).values([
            {
              channelType: 'PHONE',
              clientOrganizationId: input.clientOrganizationId,
              contactId: contact!.id,
              isPrimary: true,
              lookupHash: phoneHash,
              valueNormalized: phone,
            },
            ...(normalizedEmail
              ? [
                  {
                    channelType: 'EMAIL',
                    clientOrganizationId: input.clientOrganizationId,
                    contactId: contact!.id,
                    isPrimary: true,
                    valueNormalized: normalizedEmail,
                  },
                ]
              : []),
          ]);
          duplicateCandidate = Boolean(emailCandidate);
        }
        await tx.insert(schema.consentRecords).values({
          capturedAt: new Date(),
          clientOrganizationId: input.clientOrganizationId,
          contactId: contact!.id,
          evidence: input.body.consent.evidence,
          noticeVersion: input.body.consent.notice_version,
          purpose: input.body.consent.purpose,
          source: input.entryMethod,
          status: input.body.consent.granted ? 'GRANTED' : 'DENIED',
        });

        let campaignId: string | null = null;
        if (input.body.campaign) {
          const [campaign] = await tx
            .insert(schema.campaignAttributions)
            .values({
              adId: input.body.campaign.ad_id,
              adSetId: input.body.campaign.ad_set_id,
              campaignId: input.body.campaign.campaign_id,
              campaignName: input.body.campaign.campaign_name,
              clientOrganizationId: input.clientOrganizationId,
              formId: input.body.campaign.form_id,
              gclid: input.body.campaign.gclid,
              pageUrl: input.body.campaign.page_url,
              utmCampaign: input.body.campaign.utm_campaign,
              utmContent: input.body.campaign.utm_content,
              utmMedium: input.body.campaign.utm_medium,
              utmSource: input.body.campaign.utm_source,
              utmTerm: input.body.campaign.utm_term,
            })
            .returning({ id: schema.campaignAttributions.id });
          campaignId = campaign!.id;
        }

        const now = new Date();
        const sla = await this.slaDates(
          tx,
          input.clientOrganizationId,
          branch.id,
          branch.timezone,
          now,
        );
        const assignment = isWithinWorkingHours(now, branch.timezone, sla.schedule)
          ? await this.roundRobin(
              tx,
              input.clientOrganizationId,
              branch.id,
              input.body.assignment_queue_id ?? null,
              input.body.source,
              input.body.language ?? null,
              now,
            )
          : null;
        const [lead] = await tx
          .insert(schema.leadOpportunities)
          .values({
            assignmentQueueId: assignment?.queueId ?? input.body.assignment_queue_id,
            branchId: branch.id,
            campaignAttributionId: campaignId,
            clientOrganizationId: input.clientOrganizationId,
            contactId: contact!.id,
            conversationOwnerId: assignment?.userId,
            conversationOwnerMembershipId: assignment?.membershipId,
            currentProcessOwnerId: assignment?.userId,
            currentProcessOwnerMembershipId: assignment?.membershipId,
            entryMethod: input.entryMethod,
            language: input.body.language,
            slaDueAt: sla.dueAt,
            slaWarningAt: sla.warningAt,
            source: input.body.source,
            sourceMetadata: input.body.source_metadata,
            sourceName: input.body.source_name,
            status: 'PENDING_REVIEW',
            vehicleInterest: input.body.vehicle_interest,
          })
          .returning();
        await tx.insert(schema.leadStatusHistory).values([
          {
            clientOrganizationId: input.clientOrganizationId,
            evidence: { entry_method: input.entryMethod },
            leadId: lead!.id,
            reason: 'Lead captured durably.',
            toStatus: 'NEW',
          },
          {
            clientOrganizationId: input.clientOrganizationId,
            evidence: { automatic: true },
            fromStatus: 'NEW',
            leadId: lead!.id,
            reason: 'Lead queued for review.',
            toStatus: 'PENDING_REVIEW',
          },
        ]);
        await tx.insert(schema.slaTimers).values({
          clientOrganizationId: input.clientOrganizationId,
          dueAt: sla.dueAt,
          leadId: lead!.id,
          startedAt: now,
          warningAt: sla.warningAt,
        });
        if (assignment) {
          await tx.insert(schema.leadAssignments).values({
            clientOrganizationId: input.clientOrganizationId,
            leadId: lead!.id,
            method: 'ROUND_ROBIN',
            reason: 'Eligible queue rotation at capture.',
            toMembershipId: assignment.membershipId,
          });
        }
        if (emailCandidate && emailCandidate.id !== contact!.id) {
          await tx.insert(schema.duplicateCandidates).values({
            candidateContactId: emailCandidate.id,
            clientOrganizationId: input.clientOrganizationId,
            contactId: contact!.id,
            leadId: lead!.id,
            matchType: 'EMAIL',
            score: 80,
          });
        }
        await this.event(
          tx,
          input.clientOrganizationId,
          lead!.id,
          'LEAD_CAPTURED',
          input.correlationId,
          {
            source: lead!.source,
            status: lead!.status,
          },
        );
        await this.audit(
          tx,
          input.actor,
          input.clientOrganizationId,
          'LEAD_CREATED',
          lead!.id,
          input.correlationId,
          { source: lead!.source, status: lead!.status },
        );
        const presented = await this.presentLead(tx, input.clientOrganizationId, lead!.id);
        const response = {
          duplicate_candidate: duplicateCandidate,
          lead: presented,
          replayed: false,
        };
        await tx.insert(schema.leadIngestionReceipts).values({
          clientOrganizationId: input.clientOrganizationId,
          externalEventId: input.idempotencyKey,
          leadId: lead!.id,
          provider: input.provider,
          requestFingerprint: requestHash,
          responseSnapshot: response,
        });
        return response;
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const [receipt] = await this.connection.db
        .select()
        .from(schema.leadIngestionReceipts)
        .where(
          and(
            eq(schema.leadIngestionReceipts.clientOrganizationId, input.clientOrganizationId),
            eq(schema.leadIngestionReceipts.provider, input.provider),
            eq(schema.leadIngestionReceipts.externalEventId, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (!receipt) throw error;
      if (receipt.requestFingerprint !== requestHash)
        throw conflict(
          'IDEMPOTENCY_MISMATCH',
          'This idempotency key was used for another request.',
        );
      return { ...(receipt.responseSnapshot ?? {}), replayed: true };
    }
  }

  async list(context: AuthorizationContext, query: LeadListQuery) {
    const cid = clientId(context);
    const conditions = [eq(schema.leadOpportunities.clientOrganizationId, cid)];
    if (query.status) conditions.push(eq(schema.leadOpportunities.status, query.status));
    if (query.source) conditions.push(eq(schema.leadOpportunities.source, query.source));
    if (query.campaign)
      conditions.push(ilike(schema.campaignAttributions.campaignName, `%${query.campaign}%`));
    if (query.branch_id) conditions.push(eq(schema.leadOpportunities.branchId, query.branch_id));
    if (query.queue_id)
      conditions.push(eq(schema.leadOpportunities.assignmentQueueId, query.queue_id));
    if (query.sla !== 'ALL') conditions.push(eq(schema.leadOpportunities.slaState, query.sla));
    if (query.search)
      conditions.push(
        or(
          ilike(schema.contacts.displayName, `%${query.search}%`),
          ilike(schema.contacts.primaryPhoneE164, `%${query.search}%`),
          ilike(schema.leadOpportunities.vehicleInterest, `%${query.search}%`),
        )!,
      );
    if (query.history_status) {
      const history = await this.connection.db
        .select({ leadId: schema.leadStatusHistory.leadId })
        .from(schema.leadStatusHistory)
        .where(
          and(
            eq(schema.leadStatusHistory.clientOrganizationId, cid),
            eq(schema.leadStatusHistory.toStatus, query.history_status),
          ),
        );
      if (history.length === 0) return { leads: [] };
      conditions.push(
        inArray(
          schema.leadOpportunities.id,
          history.map((row) => row.leadId),
        ),
      );
    }
    const rows = await this.connection.db
      .select({
        campaignName: schema.campaignAttributions.campaignName,
        contactName: schema.contacts.displayName,
        lead: schema.leadOpportunities,
        phone: schema.contacts.primaryPhoneE164,
        queueDepartmentId: schema.teams.departmentId,
        queueTeamId: schema.assignmentQueues.teamId,
      })
      .from(schema.leadOpportunities)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.leadOpportunities.contactId),
        ),
      )
      .leftJoin(
        schema.campaignAttributions,
        and(
          eq(schema.campaignAttributions.clientOrganizationId, cid),
          eq(schema.campaignAttributions.id, schema.leadOpportunities.campaignAttributionId),
        ),
      )
      .leftJoin(
        schema.assignmentQueues,
        and(
          eq(schema.assignmentQueues.clientOrganizationId, cid),
          eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
        ),
      )
      .leftJoin(
        schema.teams,
        and(
          eq(schema.teams.clientOrganizationId, cid),
          eq(schema.teams.id, schema.assignmentQueues.teamId),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(schema.leadOpportunities.capturedAt))
      .limit(Math.min(query.limit * 4, 400));
    return {
      leads: rows
        .filter((row) => this.canAccess(context, row.lead, row.queueTeamId, row.queueDepartmentId))
        .slice(0, query.limit)
        .map((row) => this.summary(row.lead, row.contactName, row.phone, row.campaignName)),
    };
  }

  async detail(context: AuthorizationContext, leadId: string) {
    const cid = clientId(context);
    const row = await this.readLead(cid, leadId);
    if (!row || !this.canAccess(context, row.lead, row.queueTeamId, row.queueDepartmentId))
      throw notFound('Lead not found.');
    const [history, notes, assignments, followUps, tasks, duplicates] = await Promise.all([
      this.connection.db
        .select()
        .from(schema.leadStatusHistory)
        .where(
          and(
            eq(schema.leadStatusHistory.clientOrganizationId, cid),
            eq(schema.leadStatusHistory.leadId, leadId),
          ),
        )
        .orderBy(desc(schema.leadStatusHistory.createdAt)),
      this.connection.db
        .select()
        .from(schema.leadNotes)
        .where(
          and(eq(schema.leadNotes.clientOrganizationId, cid), eq(schema.leadNotes.leadId, leadId)),
        )
        .orderBy(desc(schema.leadNotes.createdAt)),
      this.connection.db
        .select()
        .from(schema.leadAssignments)
        .where(
          and(
            eq(schema.leadAssignments.clientOrganizationId, cid),
            eq(schema.leadAssignments.leadId, leadId),
          ),
        )
        .orderBy(desc(schema.leadAssignments.createdAt)),
      this.connection.db
        .select()
        .from(schema.leadFollowUps)
        .where(
          and(
            eq(schema.leadFollowUps.clientOrganizationId, cid),
            eq(schema.leadFollowUps.leadId, leadId),
          ),
        )
        .orderBy(desc(schema.leadFollowUps.createdAt)),
      this.connection.db
        .select()
        .from(schema.leadTasks)
        .where(
          and(eq(schema.leadTasks.clientOrganizationId, cid), eq(schema.leadTasks.leadId, leadId)),
        )
        .orderBy(desc(schema.leadTasks.createdAt)),
      this.connection.db
        .select()
        .from(schema.duplicateCandidates)
        .where(
          and(
            eq(schema.duplicateCandidates.clientOrganizationId, cid),
            eq(schema.duplicateCandidates.leadId, leadId),
          ),
        )
        .orderBy(desc(schema.duplicateCandidates.createdAt)),
    ]);
    return {
      follow_ups: followUps,
      lead: {
        ...this.summary(
          row.lead,
          row.contact.displayName,
          row.contact.primaryPhoneE164,
          row.campaign?.campaignName ?? null,
        ),
        alternate_phone_e164: row.contact.alternatePhoneE164,
        campaign: row.campaign ? this.presentCampaign(row.campaign) : null,
        email: row.contact.primaryEmailNormalized,
        entry_method: row.lead.entryMethod,
        lost_reason: row.lead.lostReason,
        rejection_reason: row.lead.rejectionReason,
      },
      tasks,
      timeline: [
        ...history.map((item) => ({
          actor_id: item.actorId,
          detail: item.reason,
          id: item.id,
          occurred_at: item.createdAt.toISOString(),
          title: `${item.fromStatus ?? 'CAPTURE'} → ${item.toStatus}`,
          type: 'STATUS',
        })),
        ...assignments.map((item) => ({
          actor_id: item.assignedBy,
          detail: item.reason,
          id: item.id,
          occurred_at: item.createdAt.toISOString(),
          title: `Assigned by ${item.method}`,
          type: 'ASSIGNMENT',
        })),
        ...notes.map((item) => ({
          actor_id: item.authorId,
          detail: item.note,
          id: item.id,
          occurred_at: item.createdAt.toISOString(),
          title: 'Note added',
          type: 'NOTE',
        })),
        ...followUps.map((item) => ({
          actor_id: item.createdBy,
          detail: item.note ?? item.purpose,
          id: item.id,
          occurred_at: (item.completedAt ?? item.createdAt).toISOString(),
          title:
            item.status === 'COMPLETED'
              ? `Follow-up completed: ${item.outcome ?? item.purpose}`
              : `Follow-up scheduled: ${item.purpose}`,
          type: 'FOLLOW_UP',
        })),
        ...tasks.map((item) => ({
          actor_id: item.createdBy,
          detail: item.title,
          id: item.id,
          occurred_at: (item.completedAt ?? item.createdAt).toISOString(),
          title: item.status === 'COMPLETED' ? 'Task completed' : 'Task created',
          type: 'TASK',
        })),
        ...duplicates.map((item) => ({
          actor_id: item.resolvedBy,
          detail: item.resolutionReason,
          id: item.id,
          occurred_at: (item.resolvedAt ?? item.createdAt).toISOString(),
          title:
            item.status === 'PENDING'
              ? 'Duplicate candidate detected'
              : `Duplicate review: ${item.status}`,
          type: 'DUPLICATE',
        })),
      ].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    };
  }

  async transition(
    context: AuthorizationContext,
    leadId: string,
    body: LeadTransitionRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const key = requiredIdempotencyKey(idempotencyKey);
    return this.commandReceipt(cid, `TRANSITION:${context.membershipId}`, key, body, async (tx) => {
      const lead = await this.accessibleLead(tx, context, leadId);
      if (lead.version !== body.expected_version)
        throw conflict('CONFLICT', 'Lead version changed.');
      if (!isAllowedLeadTransition(lead.status, body.to_status))
        throw conflict(
          'INVALID_TRANSITION',
          `Cannot transition ${lead.status} to ${body.to_status}.`,
        );
      if (requiresNextAction(body.to_status) && !body.next_action_at)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [{ field: 'next_action_at', reason: 'Active leads require a next action.' }],
          message: 'A next action is required.',
          retryable: false,
        });
      const now = new Date();
      const acceptedOwner = body.to_status === 'ACCEPTED' && !lead.relationshipOwnerId;
      const firstAction =
        !lead.firstActionAt && ['CONTACT_ATTEMPT', 'ACCEPTED'].includes(body.to_status);
      const [updated] = await tx
        .update(schema.leadOpportunities)
        .set({
          ...(acceptedOwner
            ? {
                relationshipOwnerId: lead.currentProcessOwnerId,
                relationshipOwnerMembershipId: lead.currentProcessOwnerMembershipId,
              }
            : {}),
          ...(firstAction ? { firstActionAt: now, slaState: 'MET' as const } : {}),
          lostReason: body.to_status === 'LOST' ? body.lost_reason : null,
          nextActionAt: body.next_action_at ? new Date(body.next_action_at) : null,
          rejectionReason: body.to_status === 'REJECTED' ? body.rejection_reason : null,
          status: body.to_status,
          updatedAt: now,
          version: lead.version + 1,
        })
        .where(
          and(
            eq(schema.leadOpportunities.clientOrganizationId, cid),
            eq(schema.leadOpportunities.id, leadId),
            eq(schema.leadOpportunities.version, body.expected_version),
          ),
        )
        .returning();
      if (!updated) throw conflict('CONFLICT', 'Lead version changed.');
      await tx.insert(schema.leadStatusHistory).values({
        actorId: context.userId,
        clientOrganizationId: cid,
        evidence: {
          follow_up_channel: body.follow_up_channel ?? null,
          lost_reason: body.lost_reason ?? null,
          rejection_reason: body.rejection_reason ?? null,
          reopen_reason: body.reopen_reason ?? null,
        },
        fromStatus: lead.status,
        leadId,
        reason: body.note,
        toStatus: body.to_status,
      });
      if (['REJECTED', 'LOST', 'REOPENED'].includes(body.to_status))
        await tx.insert(schema.leadOutcomeEvents).values({
          actorId: context.userId,
          clientOrganizationId: cid,
          eventType: body.to_status,
          leadId,
          lostReason: body.to_status === 'LOST' ? body.lost_reason : null,
          reason: body.reopen_reason ?? body.note,
          rejectionReason: body.to_status === 'REJECTED' ? body.rejection_reason : null,
        });
      if (body.next_action_at && body.follow_up_channel)
        await tx.insert(schema.leadFollowUps).values({
          channel: body.follow_up_channel,
          clientOrganizationId: cid,
          createdBy: context.userId,
          dueAt: new Date(body.next_action_at),
          leadId,
          note: body.note,
          ownerMembershipId: lead.currentProcessOwnerMembershipId ?? context.membershipId,
          priority: 'NORMAL',
          purpose: `Next action after ${body.to_status}`,
        });
      if (firstAction)
        await tx
          .update(schema.slaTimers)
          .set({ satisfiedAt: now, state: 'MET' })
          .where(
            and(
              eq(schema.slaTimers.clientOrganizationId, cid),
              eq(schema.slaTimers.leadId, leadId),
              inArray(schema.slaTimers.state, ['OPEN', 'WARNING', 'BREACHED']),
            ),
          );
      await this.audit(
        tx,
        context,
        cid,
        'LEAD_STATUS_CHANGED',
        leadId,
        correlationId,
        {
          from: lead.status,
          to: body.to_status,
        },
        body.note,
      );
      await this.event(tx, cid, leadId, 'LEAD_STATUS_CHANGED', correlationId, {
        from_status: lead.status,
        to_status: body.to_status,
      });
      return { id: leadId, status: body.to_status, version: lead.version + 1 };
    });
  }

  async assign(
    context: AuthorizationContext,
    leadId: string,
    body: AssignLeadRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const lead = await this.accessibleLead(tx, context, leadId);
      if (lead.version !== body.expected_version)
        throw conflict('CONFLICT', 'Lead version changed.');
      const [queue] = lead.assignmentQueueId
        ? await tx
            .select({ teamId: schema.assignmentQueues.teamId })
            .from(schema.assignmentQueues)
            .where(
              and(
                eq(schema.assignmentQueues.clientOrganizationId, cid),
                eq(schema.assignmentQueues.id, lead.assignmentQueueId),
              ),
            )
            .limit(1)
        : [];
      const target = await this.eligibleMembership(
        tx,
        cid,
        body.membership_id,
        lead.branchId,
        queue?.teamId ?? null,
      );
      if (!target)
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [
            {
              field: 'membership_id',
              reason: 'Membership is inactive or outside branch/team eligibility.',
            },
          ],
          message: 'The assignee is not eligible.',
          retryable: false,
        });
      const [updated] = await tx
        .update(schema.leadOpportunities)
        .set({
          conversationOwnerId: target.userId,
          conversationOwnerMembershipId: target.id,
          currentProcessOwnerId: target.userId,
          currentProcessOwnerMembershipId: target.id,
          ...(body.transfer_relationship_owner
            ? { relationshipOwnerId: target.userId, relationshipOwnerMembershipId: target.id }
            : {}),
          updatedAt: new Date(),
          version: lead.version + 1,
        })
        .where(
          and(
            eq(schema.leadOpportunities.id, leadId),
            eq(schema.leadOpportunities.clientOrganizationId, cid),
            eq(schema.leadOpportunities.version, body.expected_version),
          ),
        )
        .returning();
      if (!updated) throw conflict('CONFLICT', 'Lead version changed.');
      await tx.insert(schema.leadAssignments).values({
        assignedBy: context.userId,
        clientOrganizationId: cid,
        fromMembershipId: lead.currentProcessOwnerMembershipId,
        leadId,
        method: 'MANUAL',
        reason: body.reason,
        toMembershipId: target.id,
      });
      await this.audit(
        tx,
        context,
        cid,
        'LEAD_REASSIGNED',
        leadId,
        correlationId,
        {
          from_membership_id: lead.currentProcessOwnerMembershipId,
          to_membership_id: target.id,
          transfer_relationship_owner: body.transfer_relationship_owner,
        },
        body.reason,
      );
      await this.event(tx, cid, leadId, 'LEAD_ASSIGNED', correlationId, {
        membership_id: target.id,
      });
      return { id: leadId, version: lead.version + 1 };
    });
  }

  async addNote(
    context: AuthorizationContext,
    leadId: string,
    body: CreateLeadNoteRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    return this.commandReceipt(
      cid,
      `NOTE:${context.membershipId}`,
      requiredIdempotencyKey(key),
      body,
      async (tx) => {
        await this.accessibleLead(tx, context, leadId);
        const [note] = await tx
          .insert(schema.leadNotes)
          .values({ authorId: context.userId, clientOrganizationId: cid, leadId, note: body.note })
          .returning();
        await this.audit(tx, context, cid, 'LEAD_NOTE_ADDED', leadId, correlationId, {
          note_id: note!.id,
        });
        return { id: note!.id };
      },
    );
  }

  async addFollowUp(
    context: AuthorizationContext,
    leadId: string,
    body: CreateFollowUpRequest,
    key: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    return this.commandReceipt(
      cid,
      `FOLLOW_UP:${context.membershipId}`,
      requiredIdempotencyKey(key),
      body,
      async (tx) => {
        const lead = await this.accessibleLead(tx, context, leadId);
        const owner =
          body.owner_membership_id ?? lead.currentProcessOwnerMembershipId ?? context.membershipId;
        if (!(await this.eligibleMembership(tx, cid, owner, lead.branchId, null)))
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            details: [{ field: 'owner_membership_id', reason: 'Owner is ineligible.' }],
            message: 'Follow-up owner is ineligible.',
            retryable: false,
          });
        const [item] = await tx
          .insert(schema.leadFollowUps)
          .values({
            channel: body.channel,
            clientOrganizationId: cid,
            createdBy: context.userId,
            dueAt: new Date(body.due_at),
            leadId,
            note: body.note,
            ownerMembershipId: owner,
            priority: body.priority,
            purpose: body.purpose,
          })
          .returning();
        await tx
          .update(schema.leadOpportunities)
          .set({ nextActionAt: new Date(body.due_at), updatedAt: new Date() })
          .where(
            and(
              eq(schema.leadOpportunities.clientOrganizationId, cid),
              eq(schema.leadOpportunities.id, leadId),
            ),
          );
        await this.audit(tx, context, cid, 'LEAD_FOLLOW_UP_CREATED', leadId, correlationId, {
          follow_up_id: item!.id,
        });
        return item;
      },
    );
  }

  async addTask(
    context: AuthorizationContext,
    leadId: string,
    body: CreateLeadTaskRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const lead = await this.accessibleLead(tx, context, leadId);
      const owner =
        body.owner_membership_id ?? lead.currentProcessOwnerMembershipId ?? context.membershipId;
      if (!(await this.eligibleMembership(tx, cid, owner, lead.branchId, null)))
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [{ field: 'owner_membership_id', reason: 'Owner is ineligible.' }],
          message: 'Task owner is ineligible.',
          retryable: false,
        });
      const [item] = await tx
        .insert(schema.leadTasks)
        .values({
          clientOrganizationId: cid,
          createdBy: context.userId,
          dueAt: new Date(body.due_at),
          leadId,
          ownerMembershipId: owner,
          priority: body.priority,
          title: body.title,
        })
        .returning();
      await this.audit(tx, context, cid, 'LEAD_TASK_CREATED', leadId, correlationId, {
        task_id: item!.id,
      });
      return item;
    });
  }

  async completeFollowUp(
    context: AuthorizationContext,
    leadId: string,
    followUpId: string,
    body: CompleteFollowUpRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      await this.accessibleLead(tx, context, leadId);
      const [item] = await tx
        .update(schema.leadFollowUps)
        .set({
          completedAt: new Date(),
          note: body.note,
          outcome: body.outcome,
          status: 'COMPLETED',
        })
        .where(
          and(
            eq(schema.leadFollowUps.clientOrganizationId, cid),
            eq(schema.leadFollowUps.leadId, leadId),
            eq(schema.leadFollowUps.id, followUpId),
            eq(schema.leadFollowUps.status, 'OPEN'),
          ),
        )
        .returning();
      if (!item) throw notFound('Open follow-up not found.');
      await this.audit(tx, context, cid, 'LEAD_FOLLOW_UP_COMPLETED', leadId, correlationId, {
        follow_up_id: followUpId,
        outcome: body.outcome,
      });
      return item;
    });
  }

  async completeTask(
    context: AuthorizationContext,
    leadId: string,
    taskId: string,
    body: CompleteLeadTaskRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      await this.accessibleLead(tx, context, leadId);
      const [item] = await tx
        .update(schema.leadTasks)
        .set({ completedAt: new Date(), status: 'COMPLETED' })
        .where(
          and(
            eq(schema.leadTasks.clientOrganizationId, cid),
            eq(schema.leadTasks.leadId, leadId),
            eq(schema.leadTasks.id, taskId),
            eq(schema.leadTasks.status, 'OPEN'),
          ),
        )
        .returning();
      if (!item) throw notFound('Open task not found.');
      await this.audit(tx, context, cid, 'LEAD_TASK_COMPLETED', leadId, correlationId, {
        note: body.note,
        task_id: taskId,
      });
      return item;
    });
  }

  async duplicateQueue(context: AuthorizationContext) {
    const cid = clientId(context);
    return {
      candidates: await this.connection.db
        .select()
        .from(schema.duplicateCandidates)
        .where(
          and(
            eq(schema.duplicateCandidates.clientOrganizationId, cid),
            eq(schema.duplicateCandidates.status, 'PENDING'),
          ),
        )
        .orderBy(asc(schema.duplicateCandidates.createdAt)),
    };
  }

  async slaSettings(context: AuthorizationContext) {
    const cid = clientId(context);
    await this.connection.db
      .insert(schema.leadSettings)
      .values({ clientOrganizationId: cid })
      .onConflictDoNothing();
    const [settings] = await this.connection.db
      .select()
      .from(schema.leadSettings)
      .where(eq(schema.leadSettings.clientOrganizationId, cid))
      .limit(1);
    return {
      first_action_sla_minutes: settings!.firstActionSlaMinutes,
      outside_hours_policy: settings!.outsideHoursPolicy,
      version: settings!.version,
      warning_before_minutes: settings!.warningBeforeMinutes,
    };
  }

  async updateSlaSettings(
    context: AuthorizationContext,
    body: UpdateLeadSlaSettingsRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.leadSettings)
        .set({
          firstActionSlaMinutes: body.first_action_sla_minutes,
          outsideHoursPolicy: body.outside_hours_policy,
          updatedAt: new Date(),
          updatedBy: context.userId,
          version: body.expected_version + 1,
          warningBeforeMinutes: body.warning_before_minutes,
        })
        .where(
          and(
            eq(schema.leadSettings.clientOrganizationId, cid),
            eq(schema.leadSettings.version, body.expected_version),
          ),
        )
        .returning();
      if (!updated) throw conflict('CONFLICT', 'Lead SLA settings version changed.');
      await this.audit(tx, context, cid, 'LEAD_SLA_SETTINGS_UPDATED', cid, correlationId, {
        first_action_sla_minutes: body.first_action_sla_minutes,
        outside_hours_policy: body.outside_hours_policy,
        version: updated.version,
        warning_before_minutes: body.warning_before_minutes,
      });
      return {
        first_action_sla_minutes: updated.firstActionSlaMinutes,
        outside_hours_policy: updated.outsideHoursPolicy,
        version: updated.version,
        warning_before_minutes: updated.warningBeforeMinutes,
      };
    });
  }

  async resolveDuplicate(
    context: AuthorizationContext,
    candidateId: string,
    body: ResolveDuplicateRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [candidate] = await tx
        .select()
        .from(schema.duplicateCandidates)
        .where(
          and(
            eq(schema.duplicateCandidates.clientOrganizationId, cid),
            eq(schema.duplicateCandidates.id, candidateId),
            eq(schema.duplicateCandidates.status, 'PENDING'),
          ),
        )
        .limit(1);
      if (!candidate) throw notFound('Duplicate candidate not found.');
      if (body.resolution === 'LINK_CANONICAL') {
        if (
          !body.canonical_contact_id ||
          ![candidate.contactId, candidate.candidateContactId].includes(body.canonical_contact_id)
        )
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            details: [
              { field: 'canonical_contact_id', reason: 'Select one of the candidate contacts.' },
            ],
            message: 'Canonical contact is required.',
            retryable: false,
          });
        const nonCanonical =
          body.canonical_contact_id === candidate.contactId
            ? candidate.candidateContactId
            : candidate.contactId;
        await tx
          .update(schema.contacts)
          .set({
            canonicalContactId: body.canonical_contact_id,
            updatedAt: new Date(),
            version: sql`${schema.contacts.version} + 1`,
          })
          .where(
            and(
              eq(schema.contacts.clientOrganizationId, cid),
              eq(schema.contacts.id, nonCanonical),
            ),
          );
      }
      const status =
        body.resolution === 'LINK_CANONICAL'
          ? 'LINKED'
          : body.resolution === 'KEEP_SEPARATE'
            ? 'KEPT_SEPARATE'
            : 'DISMISSED';
      await tx
        .update(schema.duplicateCandidates)
        .set({
          resolutionReason: body.reason,
          resolvedAt: new Date(),
          resolvedBy: context.userId,
          status,
        })
        .where(
          and(
            eq(schema.duplicateCandidates.clientOrganizationId, cid),
            eq(schema.duplicateCandidates.id, candidateId),
          ),
        );
      await this.audit(
        tx,
        context,
        cid,
        'LEAD_DUPLICATE_REVIEWED',
        candidate.leadId,
        correlationId,
        { candidate_id: candidateId, resolution: body.resolution },
        body.reason,
      );
      return { id: candidateId, status };
    });
  }

  async reconcileSla(context: AuthorizationContext, now: Date, correlationId: string) {
    const cid = clientId(context);
    return this.connection.db.transaction((tx) =>
      this.reconcileTenantSla(tx, cid, now, correlationId, context),
    );
  }

  async reconcileAllSla(now: Date): Promise<{ breached: number; warned: number }> {
    const tenants = await this.connection.db
      .selectDistinct({ clientOrganizationId: schema.slaTimers.clientOrganizationId })
      .from(schema.slaTimers)
      .where(
        and(
          inArray(schema.slaTimers.state, ['OPEN', 'WARNING', 'BREACHED']),
          lte(schema.slaTimers.warningAt, now),
        ),
      );
    const total = { breached: 0, warned: 0 };
    for (const tenant of tenants) {
      const result = await this.connection.db.transaction((tx) =>
        this.reconcileTenantSla(
          tx,
          tenant.clientOrganizationId,
          now,
          `lead-sla-monitor:${now.toISOString()}`,
        ),
      );
      total.breached += result.breached;
      total.warned += result.warned;
    }
    return total;
  }

  private async reconcileTenantSla(
    tx: Tx,
    cid: string,
    now: Date,
    correlationId: string,
    context?: AuthorizationContext,
  ): Promise<{ breached: number; warned: number }> {
    const timers = await tx
      .select()
      .from(schema.slaTimers)
      .where(
        and(
          eq(schema.slaTimers.clientOrganizationId, cid),
          inArray(schema.slaTimers.state, ['OPEN', 'WARNING', 'BREACHED']),
          lte(schema.slaTimers.warningAt, now),
        ),
      );
    let warned = 0;
    let breached = 0;
    for (const timer of timers) {
      const isBreach = timer.dueAt <= now;
      const nextState = isBreach ? 'BREACHED' : 'WARNING';
      if (timer.state === nextState) continue;
      const [claimed] = await tx
        .update(schema.slaTimers)
        .set({ state: nextState })
        .where(and(eq(schema.slaTimers.id, timer.id), eq(schema.slaTimers.state, timer.state)))
        .returning({ id: schema.slaTimers.id });
      if (!claimed) continue;
      await tx
        .update(schema.leadOpportunities)
        .set({ slaState: nextState, updatedAt: now })
        .where(
          and(
            eq(schema.leadOpportunities.clientOrganizationId, cid),
            eq(schema.leadOpportunities.id, timer.leadId),
          ),
        );
      if (isBreach) {
        breached += 1;
        await tx
          .insert(schema.slaEscalations)
          .values({
            clientOrganizationId: cid,
            leadId: timer.leadId,
            level: 1,
            reason: 'First-action SLA breached.',
            timerId: timer.id,
          })
          .onConflictDoNothing();
      } else warned += 1;
      await this.event(
        tx,
        cid,
        timer.leadId,
        isBreach ? 'LEAD_SLA_BREACHED' : 'LEAD_SLA_WARNING',
        correlationId,
        { due_at: timer.dueAt.toISOString() },
      );
    }
    await this.audit(tx, context, cid, 'LEAD_SLA_RECONCILED', cid, correlationId, {
      breached,
      warned,
    });
    return { breached, warned };
  }

  private async slaDates(tx: Tx, cid: string, branchId: string, timezone: string, now: Date) {
    await tx
      .insert(schema.leadSettings)
      .values({ clientOrganizationId: cid })
      .onConflictDoNothing();
    const [settings] = await tx
      .select()
      .from(schema.leadSettings)
      .where(eq(schema.leadSettings.clientOrganizationId, cid))
      .limit(1);
    const duration = settings!.firstActionSlaMinutes;
    const warning = settings!.warningBeforeMinutes;
    const schedule = await tx
      .select()
      .from(schema.branchWorkingHours)
      .where(
        and(
          eq(schema.branchWorkingHours.clientOrganizationId, cid),
          eq(schema.branchWorkingHours.branchId, branchId),
        ),
      );
    const fallback = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      closesAt: dayOfWeek === 0 ? null : '18:00',
      dayOfWeek,
      isClosed: dayOfWeek === 0,
      opensAt: dayOfWeek === 0 ? null : '09:00',
    }));
    const dueAt = businessSlaDeadline(
      now,
      duration,
      timezone,
      schedule.length === 7 ? schedule : fallback,
    );
    return {
      dueAt,
      schedule: schedule.length === 7 ? schedule : fallback,
      warningAt: new Date(dueAt.getTime() - warning * 60_000),
    };
  }

  private async roundRobin(
    tx: Tx,
    cid: string,
    branchId: string,
    requestedQueueId: string | null,
    source: CreateLeadRequest['source'],
    language: string | null,
    now: Date,
  ) {
    const queues = await tx
      .select()
      .from(schema.assignmentQueues)
      .where(
        and(
          eq(schema.assignmentQueues.clientOrganizationId, cid),
          eq(schema.assignmentQueues.branchId, branchId),
          eq(schema.assignmentQueues.active, true),
          ...(requestedQueueId ? [eq(schema.assignmentQueues.id, requestedQueueId)] : []),
        ),
      )
      .orderBy(asc(schema.assignmentQueues.createdAt));
    const queue = queues.find(
      (item) =>
        (item.sourceRules.length === 0 || item.sourceRules.includes(source)) &&
        (item.languageRules.length === 0 ||
          (language !== null && item.languageRules.includes(language))),
    );
    if (requestedQueueId && !queue)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [
          {
            field: 'assignment_queue_id',
            reason: 'Queue is inactive or belongs to another branch.',
          },
        ],
        message: 'The selected assignment queue is unavailable.',
        retryable: false,
      });
    if (!queue || queue.strategy === 'MANUAL') return null;
    const candidates = await tx
      .select({
        lastAssignedAt: schema.assignmentQueueMembers.lastAssignedAt,
        membershipId: schema.assignmentQueueMembers.membershipId,
      })
      .from(schema.assignmentQueueMembers)
      .where(
        and(
          eq(schema.assignmentQueueMembers.clientOrganizationId, cid),
          eq(schema.assignmentQueueMembers.queueId, queue.id),
          eq(schema.assignmentQueueMembers.active, true),
        ),
      )
      .orderBy(
        sql`${schema.assignmentQueueMembers.lastAssignedAt} nulls first`,
        asc(schema.assignmentQueueMembers.membershipId),
      )
      .for('update', { skipLocked: true });
    for (const candidate of candidates) {
      const membership = await this.eligibleMembership(
        tx,
        cid,
        candidate.membershipId,
        branchId,
        queue.teamId,
        now,
      );
      if (!membership) continue;
      const [active] = await tx
        .select({ value: count() })
        .from(schema.leadOpportunities)
        .where(
          and(
            eq(schema.leadOpportunities.clientOrganizationId, cid),
            eq(schema.leadOpportunities.currentProcessOwnerMembershipId, membership.id),
            inArray(schema.leadOpportunities.status, [
              'PENDING_REVIEW',
              'CONTACT_ATTEMPT',
              'ACCEPTED',
              'CONTACTED',
              'INTERESTED',
              'FOLLOW_UP',
              'SHOWROOM_VISIT',
              'TEST_RIDE_REQUESTED',
              'TEST_RIDE_BOOKED',
              'TEST_RIDE_COMPLETED',
              'NEGOTIATION',
              'REOPENED',
            ]),
          ),
        );
      if ((active?.value ?? 0) >= queue.maxActiveLeadsPerUser) continue;
      await tx
        .update(schema.assignmentQueueMembers)
        .set({ lastAssignedAt: now })
        .where(
          and(
            eq(schema.assignmentQueueMembers.queueId, queue.id),
            eq(schema.assignmentQueueMembers.membershipId, membership.id),
          ),
        );
      return { membershipId: membership.id, queueId: queue.id, userId: membership.userId };
    }
    return null;
  }

  private async eligibleMembership(
    tx: Tx,
    cid: string,
    membershipId: string,
    branchId: string,
    teamId: string | null,
    now = new Date(),
  ) {
    const [member] = await tx
      .select({
        branchScopeMode: schema.memberships.branchScopeMode,
        departmentScopeMode: schema.memberships.departmentScopeMode,
        effectiveUntil: schema.memberships.effectiveUntil,
        id: schema.memberships.id,
        status: schema.memberships.status,
        teamScopeMode: schema.memberships.teamScopeMode,
        userId: schema.memberships.userId,
        userStatus: schema.users.status,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(
        and(
          eq(schema.memberships.clientOrganizationId, cid),
          eq(schema.memberships.id, membershipId),
          eq(schema.memberships.status, 'ACTIVE'),
          eq(schema.users.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!member || (member.effectiveUntil && member.effectiveUntil <= now)) return null;
    if (member.branchScopeMode !== 'ALL') {
      const [scope] = await tx
        .select()
        .from(schema.membershipBranchScopes)
        .where(
          and(
            eq(schema.membershipBranchScopes.clientOrganizationId, cid),
            eq(schema.membershipBranchScopes.membershipId, membershipId),
            eq(schema.membershipBranchScopes.branchId, branchId),
          ),
        )
        .limit(1);
      if (!scope) return null;
    }
    if (teamId) {
      const [team] = await tx
        .select({ departmentId: schema.teams.departmentId })
        .from(schema.teams)
        .where(
          and(
            eq(schema.teams.clientOrganizationId, cid),
            eq(schema.teams.branchId, branchId),
            eq(schema.teams.id, teamId),
            eq(schema.teams.active, true),
          ),
        )
        .limit(1);
      if (!team) return null;
      if (member.departmentScopeMode !== 'ALL') {
        const [departmentScope] = await tx
          .select()
          .from(schema.membershipDepartmentScopes)
          .where(
            and(
              eq(schema.membershipDepartmentScopes.clientOrganizationId, cid),
              eq(schema.membershipDepartmentScopes.membershipId, membershipId),
              eq(schema.membershipDepartmentScopes.departmentId, team.departmentId),
            ),
          )
          .limit(1);
        if (!departmentScope) return null;
      }
      const [teamMembership] = await tx
        .select({ id: schema.teamMemberships.id })
        .from(schema.teamMemberships)
        .where(
          and(
            eq(schema.teamMemberships.clientOrganizationId, cid),
            eq(schema.teamMemberships.membershipId, membershipId),
            eq(schema.teamMemberships.teamId, teamId),
            isNull(schema.teamMemberships.endedAt),
          ),
        )
        .limit(1);
      if (!teamMembership) return null;
    }
    return member;
  }

  private async accessibleLead(
    tx: Tx,
    context: AuthorizationContext,
    leadId: string,
  ): Promise<LeadRow> {
    const cid = clientId(context);
    const [row] = await tx
      .select({
        departmentId: schema.teams.departmentId,
        lead: schema.leadOpportunities,
        teamId: schema.assignmentQueues.teamId,
      })
      .from(schema.leadOpportunities)
      .leftJoin(
        schema.assignmentQueues,
        and(
          eq(schema.assignmentQueues.clientOrganizationId, cid),
          eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
        ),
      )
      .leftJoin(
        schema.teams,
        and(
          eq(schema.teams.clientOrganizationId, cid),
          eq(schema.teams.id, schema.assignmentQueues.teamId),
        ),
      )
      .where(
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, leadId),
        ),
      )
      .limit(1);
    if (!row || !this.canAccess(context, row.lead, row.teamId, row.departmentId))
      throw notFound('Lead not found.');
    return row.lead;
  }

  private canAccess(
    context: AuthorizationContext,
    lead: LeadRow,
    teamId: string | null,
    departmentId: string | null,
  ): boolean {
    if (context.roleCode === 'SALESPERSON')
      return (
        context.clientOrganizationId === lead.clientOrganizationId &&
        this.policy.canAccessBranch(context, lead.branchId) &&
        (!departmentId || this.policy.canAccessDepartment(context, departmentId)) &&
        (!teamId || this.policy.canAccessTeam(context, teamId)) &&
        lead.currentProcessOwnerId === context.userId
      );
    return this.policy.canAccessResource(context, {
      assigneeId: lead.currentProcessOwnerId,
      branchId: lead.branchId,
      clientOrganizationId: lead.clientOrganizationId,
      departmentId,
      ownerId: lead.relationshipOwnerId,
      teamId,
    });
  }

  private async readLead(cid: string, leadId: string) {
    const [row] = await this.connection.db
      .select({
        campaign: schema.campaignAttributions,
        contact: schema.contacts,
        lead: schema.leadOpportunities,
        queueDepartmentId: schema.teams.departmentId,
        queueTeamId: schema.assignmentQueues.teamId,
      })
      .from(schema.leadOpportunities)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.leadOpportunities.contactId),
        ),
      )
      .leftJoin(
        schema.campaignAttributions,
        and(
          eq(schema.campaignAttributions.clientOrganizationId, cid),
          eq(schema.campaignAttributions.id, schema.leadOpportunities.campaignAttributionId),
        ),
      )
      .leftJoin(
        schema.assignmentQueues,
        and(
          eq(schema.assignmentQueues.clientOrganizationId, cid),
          eq(schema.assignmentQueues.id, schema.leadOpportunities.assignmentQueueId),
        ),
      )
      .leftJoin(
        schema.teams,
        and(
          eq(schema.teams.clientOrganizationId, cid),
          eq(schema.teams.id, schema.assignmentQueues.teamId),
        ),
      )
      .where(
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, leadId),
        ),
      )
      .limit(1);
    return row;
  }

  private async presentLead(tx: Tx, cid: string, leadId: string) {
    const [row] = await tx
      .select({
        campaignName: schema.campaignAttributions.campaignName,
        contactName: schema.contacts.displayName,
        lead: schema.leadOpportunities,
        phone: schema.contacts.primaryPhoneE164,
      })
      .from(schema.leadOpportunities)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.leadOpportunities.contactId),
        ),
      )
      .leftJoin(
        schema.campaignAttributions,
        and(
          eq(schema.campaignAttributions.clientOrganizationId, cid),
          eq(schema.campaignAttributions.id, schema.leadOpportunities.campaignAttributionId),
        ),
      )
      .where(
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, leadId),
        ),
      )
      .limit(1);
    return this.summary(row!.lead, row!.contactName, row!.phone, row!.campaignName);
  }

  private summary(lead: LeadRow, contactName: string, phone: string, campaignName: string | null) {
    return {
      branch_id: lead.branchId,
      campaign_name: campaignName,
      captured_at: lead.capturedAt.toISOString(),
      contact_id: lead.contactId,
      contact_name: contactName,
      conversation_owner_id: lead.conversationOwnerId,
      current_process_owner_id: lead.currentProcessOwnerId,
      id: lead.id,
      next_action_at: lead.nextActionAt?.toISOString() ?? null,
      phone_e164: phone,
      relationship_owner_id: lead.relationshipOwnerId,
      sla_due_at: lead.slaDueAt.toISOString(),
      sla_state: lead.slaState,
      source: lead.source,
      source_name: lead.sourceName,
      status: lead.status,
      vehicle_interest: lead.vehicleInterest,
      version: lead.version,
    };
  }

  private presentCampaign(value: typeof schema.campaignAttributions.$inferSelect) {
    return {
      ad_id: value.adId,
      ad_set_id: value.adSetId,
      campaign_id: value.campaignId,
      campaign_name: value.campaignName,
      form_id: value.formId,
      gclid: value.gclid,
      page_url: value.pageUrl,
      utm_campaign: value.utmCampaign,
      utm_content: value.utmContent,
      utm_medium: value.utmMedium,
      utm_source: value.utmSource,
      utm_term: value.utmTerm,
    };
  }

  private async commandReceipt<T>(
    cid: string,
    provider: string,
    key: string,
    body: unknown,
    operation: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    const requestHash = fingerprint(body);
    return this.connection.db.transaction(async (tx) => {
      const [receipt] = await tx
        .select()
        .from(schema.leadIngestionReceipts)
        .where(
          and(
            eq(schema.leadIngestionReceipts.clientOrganizationId, cid),
            eq(schema.leadIngestionReceipts.provider, provider),
            eq(schema.leadIngestionReceipts.externalEventId, key),
          ),
        )
        .limit(1);
      if (receipt) {
        if (receipt.requestFingerprint !== requestHash)
          throw conflict(
            'IDEMPOTENCY_MISMATCH',
            'This idempotency key was used for another request.',
          );
        return receipt.responseSnapshot as T;
      }
      const response = await operation(tx);
      await tx.insert(schema.leadIngestionReceipts).values({
        clientOrganizationId: cid,
        externalEventId: key,
        provider,
        requestFingerprint: requestHash,
        responseSnapshot: response as Record<string, unknown>,
      });
      return response;
    });
  }

  private async event(
    tx: Tx,
    cid: string,
    leadId: string,
    eventType: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ) {
    await tx.insert(schema.outboxEvents).values({
      aggregateId: leadId,
      aggregateType: 'LEAD',
      clientOrganizationId: cid,
      correlationId,
      eventType,
      payload,
      scope: 'CLIENT',
    });
  }

  private async audit(
    tx: Tx,
    actor: AuthorizationContext | undefined,
    cid: string,
    action: string,
    entityId: string,
    correlationId: string,
    newSummary: Record<string, unknown>,
    reason?: string,
  ) {
    await tx.insert(schema.auditEvents).values({
      action,
      actorId: actor?.userId ?? null,
      actorType: actor ? 'USER' : 'SYSTEM',
      clientOrganizationId: cid,
      correlationId,
      effectiveRole: actor?.roleCode ?? 'PUBLIC_FORM',
      entityId,
      entityType: 'LEAD',
      newSummary,
      outcome: 'SUCCESS',
      reason,
      scope: 'CLIENT',
    });
  }
}
