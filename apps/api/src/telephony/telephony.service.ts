/* Telephony commands keep provider payloads at the boundary and write append-only evidence. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TELEPHONY_RECORDING_CONTENT_TYPES } from '@gdm/contracts';
import type {
  ApproveCallOutcomeExceptionRequest,
  BeginManualRecordingUploadRequest,
  CallListQuery,
  CompleteManualRecordingUploadRequest,
  ConfigureTelephonyConnectionRequest,
  RecordCallOutcomeRequest,
  StartCallRequest,
} from '@gdm/contracts';
import { type DatabaseConnection, schema } from '@gdm/database';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { AuthorizationPolicy } from '../authorization/authorization-policy.js';
import {
  authorizationScopeCondition,
  pageMetadata,
  pageOffset,
} from '../authorization/authorization-scope.sql.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from '../infrastructure/storage/object-storage.port.js';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import { canonicalJson } from './development-telephony.provider.js';
import {
  TELEPHONY_PROVIDER_REGISTRY,
  type NormalizedCallEvent,
  type TelephonyProviderConnection,
  type TelephonyProviderRegistry,
} from './telephony-provider.port.js';
import {
  TELEPHONY_RUNTIME_CONFIG,
  type TelephonyRuntimeConfig,
} from './telephony-runtime-config.js';

type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];
type CallRow = typeof schema.calls.$inferSelect;
type LeadRow = typeof schema.leadOpportunities.$inferSelect;
type ConnectionRow = typeof schema.telephonyProviderConnections.$inferSelect;
interface RecordedOutcomeResponse {
  callback_follow_up_id: string | null;
  call_id: string;
  outcome: (typeof schema.callOutcomes.$inferSelect)['outcome'];
}
interface ManualRecordingUploadReceipt {
  call_id: string;
  recording_id: string;
}

const MANUAL_RECORDING_CONTENT_TYPES = new Set<string>(TELEPHONY_RECORDING_CONTENT_TYPES);

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

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { cause?: unknown; code?: unknown };
  return candidate.code === '23505' || isUniqueViolation(candidate.cause);
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function requiredResult<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function connectionForProvider(value: ConnectionRow): TelephonyProviderConnection {
  return {
    clientOrganizationId: value.clientOrganizationId,
    connectionId: value.id,
    connectionKey: value.connectionKey,
    provider: value.provider,
    settings: value.settings,
  };
}

@Injectable()
export class TelephonyService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(TELEPHONY_PROVIDER_REGISTRY) private readonly providers: TelephonyProviderRegistry,
    @Inject(TELEPHONY_RUNTIME_CONFIG) private readonly config: TelephonyRuntimeConfig,
  ) {}

  async getConnection(context: AuthorizationContext) {
    const [connection] = await this.connection.db
      .select()
      .from(schema.telephonyProviderConnections)
      .where(
        and(
          eq(schema.telephonyProviderConnections.clientOrganizationId, clientId(context)),
          eq(schema.telephonyProviderConnections.provider, 'DEVELOPMENT'),
        ),
      )
      .limit(1);
    return connection ? this.presentConnection(connection) : { connection: null };
  }

  async configureConnection(
    context: AuthorizationContext,
    body: ConfigureTelephonyConnectionRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    if (body.active && !this.config.developmentAdapterEnabled)
      throw new ServiceUnavailableException({
        code: 'PROVIDER_UNAVAILABLE',
        details: [],
        message: 'The development telephony adapter is unavailable in this environment.',
        retryable: false,
      });
    const [existing] = await this.connection.db
      .select()
      .from(schema.telephonyProviderConnections)
      .where(
        and(
          eq(schema.telephonyProviderConnections.clientOrganizationId, cid),
          eq(schema.telephonyProviderConnections.provider, 'DEVELOPMENT'),
        ),
      )
      .limit(1);
    const connectionKey = existing?.connectionKey ?? `telephony-dev-${randomUUID()}`;
    const [connection] = await this.connection.db
      .insert(schema.telephonyProviderConnections)
      .values({
        clientOrganizationId: cid,
        connectionKey,
        displayName: body.display_name,
        provider: 'DEVELOPMENT',
        settings: { development_only: true },
        status: body.active ? 'ACTIVE' : 'DISABLED',
      })
      .onConflictDoUpdate({
        target: [
          schema.telephonyProviderConnections.clientOrganizationId,
          schema.telephonyProviderConnections.provider,
        ],
        set: {
          displayName: body.display_name,
          status: body.active ? 'ACTIVE' : 'DISABLED',
          updatedAt: new Date(),
        },
      })
      .returning();
    const savedConnection = requiredResult(connection, 'Telephony connection was not returned.');
    await this.audit(
      context,
      cid,
      'TELEPHONY_CONNECTION_CONFIGURED',
      savedConnection.id,
      correlationId,
      {
        provider: savedConnection.provider,
        status: savedConnection.status,
      },
    );
    return this.presentConnection(savedConnection);
  }

  async health(context: AuthorizationContext, correlationId: string) {
    const cid = clientId(context);
    const [connection] = await this.connection.db
      .select()
      .from(schema.telephonyProviderConnections)
      .where(
        and(
          eq(schema.telephonyProviderConnections.clientOrganizationId, cid),
          eq(schema.telephonyProviderConnections.provider, 'DEVELOPMENT'),
        ),
      )
      .limit(1);
    if (!connection) return { configured: false, healthy: false, webhook_last_at: null };
    const provider = this.providers.provider(connection.provider);
    const result = provider
      ? await provider.healthCheck(connectionForProvider(connection))
      : { detail: 'No adapter is registered for this connection.', healthy: false };
    await this.connection.db
      .update(schema.telephonyProviderConnections)
      .set({
        lastHealthAt: new Date(),
        lastHealthStatus: result.healthy ? 'HEALTHY' : 'DEGRADED',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.telephonyProviderConnections.clientOrganizationId, cid),
          eq(schema.telephonyProviderConnections.id, connection.id),
        ),
      );
    await this.audit(context, cid, 'TELEPHONY_HEALTH_CHECKED', connection.id, correlationId, {
      healthy: result.healthy,
    });
    return {
      configured: true,
      detail: result.detail ?? null,
      healthy: result.healthy,
      webhook_last_at: connection.lastWebhookAt?.toISOString() ?? null,
    };
  }

  async startCall(
    context: AuthorizationContext,
    leadId: string,
    body: StartCallRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const key = requiredIdempotencyKey(idempotencyKey);
    const existing = await this.commandReceipt<ReturnType<TelephonyService['presentCall']>>(
      cid,
      `TELEPHONY_START:${context.membershipId}`,
      key,
      { body, leadId },
    );
    if (existing) return { ...existing, replayed: true };

    const lead = await this.accessibleLead(context, leadId);
    const callId = randomUUID();
    let connection: ConnectionRow | undefined;
    let providerCallId: string | undefined;
    let provider = 'TEL_FALLBACK';
    let status: CallRow['status'] = 'REQUESTED';
    if (body.mode === 'PROVIDER') {
      connection = await this.activeDevelopmentConnection(cid);
      const adapter = this.providers.provider(connection.provider);
      if (!adapter)
        throw new ServiceUnavailableException({
          code: 'PROVIDER_UNAVAILABLE',
          details: [],
          message: 'No approved telephony provider is active.',
          retryable: true,
        });
      const started = await adapter.startCall(connectionForProvider(connection), {
        callId,
        contactPhoneE164: lead.contact.primaryPhoneE164,
        initiatedByUserId: context.userId,
        leadId: lead.lead.id,
      });
      provider = connection.provider;
      providerCallId = started.providerCallId;
      status = started.status;
    }

    const response = await this.connection.db.transaction(async (tx) => {
      const [call] = await tx
        .insert(schema.calls)
        .values({
          clientOrganizationId: cid,
          connectionId: connection?.id ?? null,
          contactId: lead.contact.id,
          direction: 'OUTBOUND',
          id: callId,
          initiatedByMembershipId: context.membershipId,
          initiatedByUserId: context.userId,
          leadId: lead.lead.id,
          origin: body.mode,
          provider,
          providerCallId: providerCallId ?? null,
          startedAt: new Date(),
          status,
        })
        .returning();
      const createdCall = requiredResult(call, 'Call was not returned after insertion.');
      await tx.insert(schema.callParticipants).values([
        {
          callId: createdCall.id,
          clientOrganizationId: cid,
          contactId: lead.contact.id,
          displayName: lead.contact.displayName,
          phoneE164: lead.contact.primaryPhoneE164,
          role: 'CUSTOMER',
        },
        {
          callId: createdCall.id,
          clientOrganizationId: cid,
          membershipId: context.membershipId,
          role: 'AGENT',
          userId: context.userId,
        },
      ]);
      await tx.insert(schema.callEvents).values({
        callId: createdCall.id,
        clientOrganizationId: cid,
        eventType: body.mode === 'PROVIDER' ? 'CALL_START_REQUESTED' : 'TEL_FALLBACK_LAUNCHED',
        occurredAt: new Date(),
        payload: { mode: body.mode },
        provider,
        status,
      });
      await this.event(tx, cid, createdCall.id, 'TELEPHONY_CALL_STARTED', correlationId, {
        lead_id: lead.lead.id,
        mode: body.mode,
        provider,
      });
      await this.auditTx(
        tx,
        context,
        cid,
        'TELEPHONY_CALL_STARTED',
        createdCall.id,
        correlationId,
        {
          lead_id: lead.lead.id,
          mode: body.mode,
          provider,
        },
      );
      return {
        ...this.presentCall(createdCall),
        ...(body.mode === 'TEL_FALLBACK'
          ? { tel_uri: `tel:${lead.contact.primaryPhoneE164}` }
          : {}),
      };
    });
    await this.storeCommandReceipt(
      cid,
      `TELEPHONY_START:${context.membershipId}`,
      key,
      { body, leadId },
      response,
    );
    return { ...response, replayed: false };
  }

  async calls(context: AuthorizationContext, query: CallListQuery) {
    const cid = clientId(context);
    const conditions = [
      eq(schema.calls.clientOrganizationId, cid),
      authorizationScopeCondition(context, {
        assignee: schema.leadOpportunities.currentProcessOwnerId,
        branch: schema.leadOpportunities.branchId,
        department: schema.teams.departmentId,
        owner: schema.leadOpportunities.relationshipOwnerId,
        team: schema.assignmentQueues.teamId,
      }),
    ];
    if (query.lead_id) conditions.push(eq(schema.calls.leadId, query.lead_id));
    if (query.missing_outcome) conditions.push(eq(schema.calls.outcomeRequirement, 'REQUIRED'));
    const rows = await this.connection.db
      .select({
        call: schema.calls,
        departmentId: schema.teams.departmentId,
        lead: schema.leadOpportunities,
        teamId: schema.assignmentQueues.teamId,
      })
      .from(schema.calls)
      .innerJoin(
        schema.leadOpportunities,
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, schema.calls.leadId),
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
      .orderBy(desc(schema.calls.createdAt))
      .limit(query.limit + 1)
      .offset(pageOffset(query.page, query.limit));
    const accessible = rows.filter((row) =>
      this.canAccess(context, row.lead, row.teamId, row.departmentId),
    );
    return {
      calls: accessible.slice(0, query.limit).map((row) => this.presentCall(row.call)),
      pagination: pageMetadata(query.page, query.limit, accessible.length),
    };
  }

  async detail(context: AuthorizationContext, callId: string) {
    const cid = clientId(context);
    const call = await this.accessibleCall(context, callId);
    const [events, outcomes, recordings, exceptions] = await Promise.all([
      this.connection.db
        .select()
        .from(schema.callEvents)
        .where(
          and(
            eq(schema.callEvents.clientOrganizationId, cid),
            eq(schema.callEvents.callId, call.id),
          ),
        )
        .orderBy(desc(schema.callEvents.occurredAt)),
      this.connection.db
        .select()
        .from(schema.callOutcomes)
        .where(
          and(
            eq(schema.callOutcomes.clientOrganizationId, cid),
            eq(schema.callOutcomes.callId, call.id),
          ),
        )
        .limit(1),
      this.connection.db
        .select()
        .from(schema.callRecordings)
        .where(
          and(
            eq(schema.callRecordings.clientOrganizationId, cid),
            eq(schema.callRecordings.callId, call.id),
          ),
        )
        .orderBy(desc(schema.callRecordings.createdAt)),
      this.connection.db
        .select()
        .from(schema.callOutcomeExceptions)
        .where(
          and(
            eq(schema.callOutcomeExceptions.clientOrganizationId, cid),
            eq(schema.callOutcomeExceptions.callId, call.id),
          ),
        )
        .limit(1),
    ]);
    const outcome = outcomes[0];
    return {
      call: this.presentCall(call),
      events: events.map((event) => ({
        event_type: event.eventType,
        id: event.id,
        occurred_at: event.occurredAt.toISOString(),
        status: event.status,
      })),
      exception: exceptions[0]
        ? {
            reason: exceptions[0].reason,
            created_at: exceptions[0].createdAt.toISOString(),
          }
        : null,
      outcome: outcome
        ? {
            callback_follow_up_id: outcome.callbackFollowUpId,
            created_at: outcome.createdAt.toISOString(),
            note: outcome.note,
            outcome: outcome.outcome,
          }
        : null,
      recordings: recordings.map((recording) => ({
        availability: recording.availability,
        id: recording.id,
        recorded_at: recording.recordedAt?.toISOString() ?? null,
        retention_expires_at: recording.retentionExpiresAt?.toISOString() ?? null,
        source: recording.source,
      })),
    };
  }

  async recordOutcome(
    context: AuthorizationContext,
    callId: string,
    body: RecordCallOutcomeRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const key = requiredIdempotencyKey(idempotencyKey);
    const existing = await this.commandReceipt<RecordedOutcomeResponse>(
      cid,
      `TELEPHONY_OUTCOME:${context.membershipId}`,
      key,
      { body, callId },
    );
    if (existing) return { ...existing, replayed: true };
    const call = await this.accessibleCall(context, callId);
    if (call.outcomeRequirement === 'EXCEPTION')
      throw conflict(
        'OUTCOME_EXCEPTION_RECORDED',
        'A supervisor exception already closed this outcome requirement.',
      );

    const response = await this.connection.db.transaction(async (tx) => {
      const [existingOutcome] = await tx
        .select({ id: schema.callOutcomes.id })
        .from(schema.callOutcomes)
        .where(
          and(
            eq(schema.callOutcomes.clientOrganizationId, cid),
            eq(schema.callOutcomes.callId, call.id),
          ),
        )
        .limit(1);
      if (existingOutcome)
        throw conflict('CALL_OUTCOME_EXISTS', 'This call already has an outcome.');
      const [lead] = await tx
        .select()
        .from(schema.leadOpportunities)
        .where(
          and(
            eq(schema.leadOpportunities.clientOrganizationId, cid),
            eq(schema.leadOpportunities.id, call.leadId),
          ),
        )
        .limit(1);
      if (!lead) throw notFound('Lead not found.');
      let callbackFollowUpId: string | null = null;
      const callbackDueAt = body.callback_due_at ? new Date(body.callback_due_at) : undefined;
      if (body.outcome === 'CALLBACK') {
        if (!callbackDueAt)
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            details: [
              { field: 'callback_due_at', reason: 'Callback outcome requires a due time.' },
            ],
            message: 'Callback due time is required.',
            retryable: false,
          });
        const [followUp] = await tx
          .insert(schema.leadFollowUps)
          .values({
            channel: 'CALL',
            clientOrganizationId: cid,
            createdBy: context.userId,
            dueAt: callbackDueAt,
            leadId: call.leadId,
            note: body.note ?? null,
            ownerMembershipId:
              lead.currentProcessOwnerMembershipId ??
              call.initiatedByMembershipId ??
              context.membershipId,
            priority: 'NORMAL',
            purpose: 'Callback requested from call outcome.',
          })
          .returning({ id: schema.leadFollowUps.id });
        callbackFollowUpId = requiredResult(followUp, 'Callback follow-up was not returned.').id;
        await tx
          .update(schema.leadOpportunities)
          .set({ nextActionAt: callbackDueAt, updatedAt: new Date(), version: lead.version + 1 })
          .where(
            and(
              eq(schema.leadOpportunities.clientOrganizationId, cid),
              eq(schema.leadOpportunities.id, lead.id),
              eq(schema.leadOpportunities.version, lead.version),
            ),
          );
      }
      const [outcome] = await tx
        .insert(schema.callOutcomes)
        .values({
          callbackFollowUpId,
          callId: call.id,
          clientOrganizationId: cid,
          note: body.note ?? null,
          outcome: body.outcome,
          recordedByMembershipId: context.membershipId,
          recordedByUserId: context.userId,
        })
        .returning();
      const createdOutcome = requiredResult(outcome, 'Call outcome was not returned.');
      await tx
        .update(schema.calls)
        .set({ outcomeRequirement: 'RECORDED', updatedAt: new Date() })
        .where(and(eq(schema.calls.clientOrganizationId, cid), eq(schema.calls.id, call.id)));
      await tx.insert(schema.callEvents).values({
        callId: call.id,
        clientOrganizationId: cid,
        eventType: 'CALL_OUTCOME_RECORDED',
        occurredAt: new Date(),
        payload: { outcome: createdOutcome.outcome },
        provider: call.provider,
      });
      await this.event(tx, cid, call.id, 'TELEPHONY_OUTCOME_RECORDED', correlationId, {
        outcome: createdOutcome.outcome,
      });
      await this.auditTx(tx, context, cid, 'TELEPHONY_OUTCOME_RECORDED', call.id, correlationId, {
        callback_follow_up_id: callbackFollowUpId,
        outcome: createdOutcome.outcome,
      });
      return {
        callback_follow_up_id: callbackFollowUpId,
        call_id: call.id,
        outcome: createdOutcome.outcome,
      };
    });
    await this.storeCommandReceipt(
      cid,
      `TELEPHONY_OUTCOME:${context.membershipId}`,
      key,
      { body, callId },
      response,
    );
    return { ...response, replayed: false };
  }

  async approveOutcomeException(
    context: AuthorizationContext,
    callId: string,
    body: ApproveCallOutcomeExceptionRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const call = await this.accessibleCall(context, callId);
    if (call.status !== 'COMPLETED' || call.outcomeRequirement !== 'REQUIRED')
      throw conflict(
        'OUTCOME_NOT_REQUIRED',
        'Only completed calls with a missing outcome may be excepted.',
      );
    return this.connection.db.transaction(async (tx) => {
      const [exception] = await tx
        .insert(schema.callOutcomeExceptions)
        .values({
          approvedByMembershipId: context.membershipId,
          approvedByUserId: context.userId,
          callId: call.id,
          clientOrganizationId: cid,
          reason: body.reason,
        })
        .returning();
      await tx
        .update(schema.calls)
        .set({ outcomeRequirement: 'EXCEPTION', updatedAt: new Date() })
        .where(and(eq(schema.calls.clientOrganizationId, cid), eq(schema.calls.id, call.id)));
      await this.auditTx(
        tx,
        context,
        cid,
        'TELEPHONY_OUTCOME_EXCEPTION_APPROVED',
        call.id,
        correlationId,
        {},
        body.reason,
      );
      return {
        call_id: call.id,
        exception_id: requiredResult(exception, 'Call outcome exception was not returned.').id,
        outcome_requirement: 'EXCEPTION',
      };
    });
  }

  async recordingAccess(
    context: AuthorizationContext,
    callId: string,
    recordingId: string,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const call = await this.accessibleCall(context, callId);
    const [recording] = await this.connection.db
      .select()
      .from(schema.callRecordings)
      .where(
        and(
          eq(schema.callRecordings.clientOrganizationId, cid),
          eq(schema.callRecordings.callId, call.id),
          eq(schema.callRecordings.id, recordingId),
        ),
      )
      .limit(1);
    if (!recording) throw notFound('Recording not found.');
    if (
      recording.availability !== 'AVAILABLE' ||
      !recording.objectKey ||
      !recording.consentRecordId ||
      !recording.retentionExpiresAt ||
      recording.retentionExpiresAt <= new Date()
    )
      throw conflict(
        'RECORDING_UNAVAILABLE',
        'This recording is unavailable because consent, retention, or provider retrieval is incomplete.',
      );
    const [consent] = await this.connection.db
      .select()
      .from(schema.consentRecords)
      .where(
        and(
          eq(schema.consentRecords.clientOrganizationId, cid),
          eq(schema.consentRecords.id, recording.consentRecordId),
          eq(schema.consentRecords.contactId, call.contactId),
          eq(schema.consentRecords.purpose, 'CALL_RECORDING'),
          eq(schema.consentRecords.status, 'GRANTED'),
          isNull(schema.consentRecords.withdrawnAt),
        ),
      )
      .limit(1);
    if (!consent)
      throw conflict('RECORDING_CONSENT_REQUIRED', 'A current recording consent is required.');
    const access = await this.storage.createDownloadUrl({
      downloadFileName: `call-recording-${call.id}.audio`,
      expiresInSeconds: this.config.recordingUrlTtlSeconds,
      key: recording.objectKey,
    });
    await this.audit(context, cid, 'TELEPHONY_RECORDING_ACCESSED', recording.id, correlationId, {
      call_id: call.id,
      expires_at: access.expiresAt,
    });
    return access;
  }

  async beginManualRecordingUpload(
    context: AuthorizationContext,
    body: BeginManualRecordingUploadRequest,
    idempotencyKey: string | undefined,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const key = requiredIdempotencyKey(idempotencyKey);
    if (!MANUAL_RECORDING_CONTENT_TYPES.has(body.content_type))
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'content_type', reason: 'Unsupported audio content type.' }],
        message: 'Unsupported recording format.',
        retryable: false,
      });
    if (body.content_length > this.config.manualRecordingMaxBytes)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [
          {
            field: 'content_length',
            reason: `Recording must not exceed ${String(this.config.manualRecordingMaxBytes)} bytes.`,
          },
        ],
        message: 'Recording exceeds the configured upload limit.',
        retryable: false,
      });
    const replay = await this.commandReceipt<ManualRecordingUploadReceipt>(
      cid,
      `TELEPHONY_MANUAL_RECORDING:${context.membershipId}`,
      key,
      body,
    );
    if (replay) return this.presentManualRecordingUpload(context, replay, true);

    const prepared = body.call_id
      ? await this.manualUploadForExistingCall(context, body)
      : await this.manualUploadForLead(context, body);
    await this.assertRecordingConsent(cid, prepared.contactId, body.consent_record_id);
    const recordingId = randomUUID();
    const objectKey = `clients/${cid}/telephony/recordings/${recordingId}`;
    const upload = await this.storage.createUploadUrl({
      ...(body.checksum_sha256 ? { checksumSha256: body.checksum_sha256 } : {}),
      contentLength: body.content_length,
      contentType: body.content_type,
      expiresInSeconds: this.config.recordingUrlTtlSeconds,
      key: objectKey,
    });

    let receipt: ManualRecordingUploadReceipt;
    try {
      receipt = await this.connection.db.transaction(async (tx) => {
        const call = prepared.existingCall
          ? prepared.existingCall
          : await this.createManualCall(tx, context, prepared.lead, body, correlationId);
        const [recording] = await tx
          .insert(schema.callRecordings)
          .values({
            availability: 'PENDING',
            callId: call.id,
            checksumSha256: body.checksum_sha256 ?? null,
            clientOrganizationId: cid,
            consentRecordId: body.consent_record_id,
            mimeType: body.content_type,
            objectKey,
            originalFilename: body.original_filename,
            recordedAt: new Date(body.call_date_at),
            retentionExpiresAt: await this.recordingRetentionExpiry(tx, cid, body.call_date_at),
            sizeBytes: body.content_length,
            source: 'MANUAL_UPLOAD',
            uploadNotes: body.notes ?? null,
            uploadedByMembershipId: context.membershipId,
            uploadedByUserId: context.userId,
          })
          .returning({ id: schema.callRecordings.id });
        const saved = requiredResult(recording, 'Manual recording metadata was not returned.');
        await tx.insert(schema.callEvents).values({
          callId: call.id,
          clientOrganizationId: cid,
          eventType: 'CALL_RECORDING_UPLOAD_STARTED',
          occurredAt: new Date(),
          payload: {
            content_length: body.content_length,
            content_type: body.content_type,
            recording_id: saved.id,
            source: 'MANUAL_UPLOAD',
          },
          provider: 'MANUAL_UPLOAD',
        });
        await this.event(tx, cid, call.id, 'TELEPHONY_RECORDING_UPLOAD_STARTED', correlationId, {
          recording_id: saved.id,
          source: 'MANUAL_UPLOAD',
        });
        await this.auditTx(
          tx,
          context,
          cid,
          'TELEPHONY_RECORDING_UPLOAD_STARTED',
          saved.id,
          correlationId,
          { call_id: call.id, content_type: body.content_type, source: 'MANUAL_UPLOAD' },
        );
        const response = { call_id: call.id, recording_id: saved.id };
        await tx.insert(schema.leadIngestionReceipts).values({
          clientOrganizationId: cid,
          externalEventId: key,
          provider: `TELEPHONY_MANUAL_RECORDING:${context.membershipId}`,
          requestFingerprint: fingerprint(body),
          responseSnapshot: response,
        });
        return response;
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const concurrentReplay = await this.commandReceipt<ManualRecordingUploadReceipt>(
        cid,
        `TELEPHONY_MANUAL_RECORDING:${context.membershipId}`,
        key,
        body,
      );
      if (!concurrentReplay) throw error;
      return this.presentManualRecordingUpload(context, concurrentReplay, true);
    }
    return { ...receipt, replayed: false, upload };
  }

  async completeManualRecordingUpload(
    context: AuthorizationContext,
    recordingId: string,
    body: CompleteManualRecordingUploadRequest,
    correlationId: string,
  ) {
    const cid = clientId(context);
    const [recording] = await this.connection.db
      .select()
      .from(schema.callRecordings)
      .where(
        and(
          eq(schema.callRecordings.clientOrganizationId, cid),
          eq(schema.callRecordings.id, recordingId),
          eq(schema.callRecordings.source, 'MANUAL_UPLOAD'),
        ),
      )
      .limit(1);
    if (!recording) throw notFound('Manual recording upload not found.');
    await this.accessibleCall(context, recording.callId);
    if (recording.availability === 'AVAILABLE')
      return { call_id: recording.callId, recording_id: recording.id, status: 'AVAILABLE' };
    if (!recording.objectKey || !recording.consentRecordId || !recording.retentionExpiresAt)
      throw conflict('RECORDING_UNAVAILABLE', 'Manual recording metadata is incomplete.');
    const object = await this.storage.stat(recording.objectKey);
    if (
      !object ||
      object.contentLength !== body.expected_content_length ||
      object.contentLength !== recording.sizeBytes ||
      object.contentType !== body.expected_content_type ||
      object.contentType !== recording.mimeType ||
      !MANUAL_RECORDING_CONTENT_TYPES.has(object.contentType) ||
      object.contentLength > this.config.manualRecordingMaxBytes ||
      (recording.checksumSha256 && object.checksumSha256 !== recording.checksumSha256)
    )
      throw conflict(
        'RECORDING_UPLOAD_VALIDATION_FAILED',
        'The uploaded object does not match the approved audio metadata.',
      );
    const call = await this.accessibleCall(context, recording.callId);
    await this.assertRecordingConsent(cid, call.contactId, recording.consentRecordId);
    await this.connection.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.callRecordings)
        .set({ availability: 'AVAILABLE' })
        .where(
          and(
            eq(schema.callRecordings.clientOrganizationId, cid),
            eq(schema.callRecordings.id, recording.id),
            eq(schema.callRecordings.availability, 'PENDING'),
          ),
        )
        .returning({ id: schema.callRecordings.id });
      if (!updated) return false;
      await tx.insert(schema.callEvents).values({
        callId: call.id,
        clientOrganizationId: cid,
        eventType: 'CALL_RECORDING_UPLOADED',
        occurredAt: new Date(),
        payload: {
          recording_id: recording.id,
          source: 'MANUAL_UPLOAD',
        },
        provider: 'MANUAL_UPLOAD',
      });
      await this.event(tx, cid, call.id, 'TELEPHONY_RECORDING_UPLOADED', correlationId, {
        recording_id: recording.id,
        source: 'MANUAL_UPLOAD',
      });
      await this.auditTx(
        tx,
        context,
        cid,
        'TELEPHONY_RECORDING_UPLOADED',
        recording.id,
        correlationId,
        { call_id: call.id, source: 'MANUAL_UPLOAD' },
      );
      return true;
    });
    return { call_id: call.id, recording_id: recording.id, status: 'AVAILABLE' };
  }

  async recordingTargets(context: AuthorizationContext, search: string) {
    const cid = clientId(context);
    const term = search.trim();
    if (term.length < 2)
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ field: 'search', reason: 'Enter at least two characters.' }],
        message: 'A search term is required.',
        retryable: false,
      });
    const rows = await this.connection.db
      .select({
        contact: schema.contacts,
        departmentId: schema.teams.departmentId,
        lead: schema.leadOpportunities,
        teamId: schema.assignmentQueues.teamId,
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
          sql`(${schema.leadOpportunities.id}::text ilike ${`%${term}%`} or ${schema.contacts.displayName} ilike ${`%${term}%`} or ${schema.contacts.primaryPhoneE164} ilike ${`%${term}%`} or ${schema.contacts.primaryEmailNormalized} ilike ${`%${term}%`})`,
        ),
      )
      .orderBy(desc(schema.leadOpportunities.updatedAt))
      .limit(50);
    const authorized = rows
      .filter((row) => this.canAccess(context, row.lead, row.teamId, row.departmentId))
      .slice(0, 20);
    const contactIds = [...new Set(authorized.map((row) => row.contact.id))];
    const consents =
      contactIds.length === 0
        ? []
        : await this.connection.db
            .select({ contactId: schema.consentRecords.contactId, id: schema.consentRecords.id })
            .from(schema.consentRecords)
            .where(
              and(
                eq(schema.consentRecords.clientOrganizationId, cid),
                inArray(schema.consentRecords.contactId, contactIds),
                eq(schema.consentRecords.purpose, 'CALL_RECORDING'),
                eq(schema.consentRecords.status, 'GRANTED'),
                isNull(schema.consentRecords.withdrawnAt),
              ),
            );
    const consentByContact = new Map<string, string>();
    for (const consent of consents) consentByContact.set(consent.contactId, consent.id);
    return {
      targets: authorized.map((row) => ({
        consent_record_id: consentByContact.get(row.contact.id) ?? null,
        contact_id: row.contact.id,
        contact_name: row.contact.displayName,
        email: row.contact.primaryEmailNormalized,
        lead_id: row.lead.id,
        phone: row.contact.primaryPhoneE164,
      })),
    };
  }

  async receiveWebhook(input: {
    connectionKey: string;
    headers: Readonly<Record<string, string | string[] | undefined>>;
    payload: unknown;
    providerCode: string;
    rawBody?: string;
    correlationId: string;
  }) {
    const providerCode = input.providerCode.trim().toUpperCase();
    const [connection] = await this.connection.db
      .select()
      .from(schema.telephonyProviderConnections)
      .where(
        and(
          eq(schema.telephonyProviderConnections.connectionKey, input.connectionKey),
          eq(schema.telephonyProviderConnections.provider, providerCode),
          eq(schema.telephonyProviderConnections.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!connection) throw notFound('Telephony webhook endpoint is unavailable.');
    const provider = this.providers.provider(providerCode);
    if (!provider) throw notFound('Telephony webhook endpoint is unavailable.');
    const rawBody = input.rawBody ?? canonicalJson(input.payload);
    if (
      !(await provider.verifyWebhook({
        connection: connectionForProvider(connection),
        headers: input.headers,
        rawBody,
      }))
    )
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: [],
        message: 'Webhook signature is invalid.',
        retryable: false,
      });
    const normalized = await provider.parseCallEvent({
      connection: connectionForProvider(connection),
      payload: input.payload,
    });
    const cid = connection.clientOrganizationId;
    const existing = await this.connection.db
      .select({ id: schema.webhookEvents.id })
      .from(schema.webhookEvents)
      .where(
        and(
          eq(schema.webhookEvents.clientOrganizationId, cid),
          eq(schema.webhookEvents.provider, providerCode),
          eq(schema.webhookEvents.externalEventId, normalized.externalEventId),
        ),
      )
      .limit(1);
    if (existing[0]) return { accepted: true, duplicate: true };
    try {
      return await this.connection.db.transaction(async (tx) => {
        const [receipt] = await tx
          .insert(schema.webhookEvents)
          .values({
            clientOrganizationId: cid,
            correlationId: input.correlationId,
            eventType: normalized.eventType,
            externalEventId: normalized.externalEventId,
            normalizedPayload: {
              call_id: normalized.providerCallId,
              status: normalized.status,
            },
            provider: providerCode,
            rawPayload: (input.payload ?? {}) as Record<string, unknown>,
            rawPayloadExpiresAt: new Date(
              Date.now() + this.config.webhookRawRetentionHours * 60 * 60 * 1_000,
            ),
            signatureVerifiedAt: new Date(),
            status: 'PROCESSING',
          })
          .returning();
        const webhookReceipt = requiredResult(receipt, 'Webhook receipt was not returned.');
        await this.createInboundProviderCallIfMapped(tx, connection, normalized);
        const applied = await this.applyProviderEvent(
          tx,
          connection,
          normalized,
          webhookReceipt.id,
          input.correlationId,
        );
        await tx
          .update(schema.webhookEvents)
          .set({
            ...(applied
              ? { processedAt: new Date(), status: 'PROCESSED' as const }
              : {
                  lastErrorCode: 'CALL_NOT_FOUND',
                  lastErrorMessage: 'No internal call matches the provider call identifier.',
                  status: 'FAILED' as const,
                }),
          })
          .where(eq(schema.webhookEvents.id, webhookReceipt.id));
        await tx
          .update(schema.telephonyProviderConnections)
          .set({ lastWebhookAt: new Date(), updatedAt: new Date() })
          .where(eq(schema.telephonyProviderConnections.id, connection.id));
        return { accepted: true, duplicate: false, processed: applied };
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      return { accepted: true, duplicate: true };
    }
  }

  async reconcile(context: AuthorizationContext, correlationId: string) {
    const cid = clientId(context);
    const connection = await this.activeDevelopmentConnection(cid);
    const provider = this.providers.provider(connection.provider);
    if (!provider)
      throw new ServiceUnavailableException({
        code: 'PROVIDER_UNAVAILABLE',
        details: [],
        message: 'No provider adapter is registered.',
        retryable: true,
      });
    const [run] = await this.connection.db
      .insert(schema.telephonyReconciliations)
      .values({
        clientOrganizationId: cid,
        connectionId: connection.id,
        initiatedByUserId: context.userId,
        status: 'RUNNING',
      })
      .returning();
    try {
      const synced = await provider.syncCalls({ connection: connectionForProvider(connection) });
      let recoveredEvents = 0;
      for (const normalized of synced.events) {
        const applied = await this.connection.db.transaction((tx) =>
          this.applyProviderEvent(tx, connection, normalized, undefined, correlationId),
        );
        if (applied) recoveredEvents += 1;
      }
      const reconciliation = requiredResult(run, 'Reconciliation run was not returned.');
      await this.connection.db
        .update(schema.telephonyReconciliations)
        .set({
          completedAt: new Date(),
          cursor: synced.cursor ?? null,
          processedCalls: synced.events.length,
          recoveredEvents,
          status: 'COMPLETED',
        })
        .where(eq(schema.telephonyReconciliations.id, reconciliation.id));
      await this.connection.db
        .update(schema.telephonyProviderConnections)
        .set({ lastReconciledAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.telephonyProviderConnections.id, connection.id));
      await this.audit(context, cid, 'TELEPHONY_RECONCILED', reconciliation.id, correlationId, {
        recovered_events: recoveredEvents,
      });
      return {
        id: reconciliation.id,
        processed_calls: synced.events.length,
        recovered_events: recoveredEvents,
        status: 'COMPLETED',
      };
    } catch (error: unknown) {
      await this.connection.db
        .update(schema.telephonyReconciliations)
        .set({
          completedAt: new Date(),
          errorCode: error instanceof Error ? error.name : 'UNKNOWN',
          errorMessage:
            'Provider reconciliation failed. See structured logs for diagnostic detail.',
          status: 'FAILED',
        })
        .where(
          eq(
            schema.telephonyReconciliations.id,
            requiredResult(run, 'Reconciliation run was not returned.').id,
          ),
        );
      throw error;
    }
  }

  private async manualUploadForExistingCall(
    context: AuthorizationContext,
    body: BeginManualRecordingUploadRequest,
  ) {
    const call = await this.accessibleCall(
      context,
      requiredResult(body.call_id, 'Call ID is required.'),
    );
    if (body.lead_id && body.lead_id !== call.leadId)
      throw conflict('RECORDING_CALL_LEAD_MISMATCH', 'The selected Call belongs to another Lead.');
    if (body.outcome)
      throw conflict(
        'RECORDING_OUTCOME_ON_EXISTING_CALL',
        'Record an outcome through the existing call outcome action.',
      );
    if (body.call_direction !== call.direction)
      throw conflict(
        'RECORDING_CALL_DIRECTION_MISMATCH',
        'The recording direction must match the selected Call.',
      );
    return { contactId: call.contactId, existingCall: call, lead: undefined };
  }

  private async manualUploadForLead(
    context: AuthorizationContext,
    body: BeginManualRecordingUploadRequest,
  ) {
    const lead = await this.accessibleLead(
      context,
      requiredResult(body.lead_id, 'Lead ID is required.'),
    );
    return { contactId: lead.contact.id, existingCall: undefined, lead };
  }

  private async createManualCall(
    tx: Tx,
    context: AuthorizationContext,
    lead: Awaited<ReturnType<TelephonyService['accessibleLead']>> | undefined,
    body: BeginManualRecordingUploadRequest,
    correlationId: string,
  ): Promise<CallRow> {
    if (!lead) throw new Error('Manual call Lead was not resolved.');
    const cid = clientId(context);
    const occurredAt = new Date(body.call_date_at);
    const [call] = await tx
      .insert(schema.calls)
      .values({
        clientOrganizationId: cid,
        contactId: lead.contact.id,
        direction: body.call_direction,
        durationSeconds: body.duration_seconds ?? null,
        endedAt: occurredAt,
        initiatedByMembershipId: context.membershipId,
        initiatedByUserId: context.userId,
        leadId: lead.lead.id,
        origin: 'MANUAL_UPLOAD',
        outcomeRequirement: body.outcome ? 'RECORDED' : 'REQUIRED',
        provider: 'MANUAL_UPLOAD',
        providerMetadata: { recording_source: 'MANUAL_UPLOAD' },
        startedAt:
          body.duration_seconds === null || body.duration_seconds === undefined
            ? occurredAt
            : new Date(occurredAt.getTime() - body.duration_seconds * 1_000),
        status: 'COMPLETED',
      })
      .returning();
    const saved = requiredResult(call, 'Manual call was not returned.');
    await tx.insert(schema.callParticipants).values([
      {
        callId: saved.id,
        clientOrganizationId: cid,
        contactId: lead.contact.id,
        displayName: lead.contact.displayName,
        phoneE164: lead.contact.primaryPhoneE164,
        role: 'CUSTOMER',
      },
      {
        callId: saved.id,
        clientOrganizationId: cid,
        membershipId: context.membershipId,
        role: 'AGENT',
        userId: context.userId,
      },
    ]);
    await tx.insert(schema.callEvents).values({
      callId: saved.id,
      clientOrganizationId: cid,
      eventType: 'MANUAL_CALL_RECORDED',
      occurredAt,
      payload: { source: 'MANUAL_UPLOAD' },
      provider: 'MANUAL_UPLOAD',
      status: 'COMPLETED',
    });
    if (body.outcome)
      await tx.insert(schema.callOutcomes).values({
        callId: saved.id,
        clientOrganizationId: cid,
        note: body.notes ?? null,
        outcome: body.outcome,
        recordedByMembershipId: context.membershipId,
        recordedByUserId: context.userId,
      });
    await this.event(tx, cid, saved.id, 'TELEPHONY_MANUAL_CALL_RECORDED', correlationId, {
      source: 'MANUAL_UPLOAD',
    });
    await this.auditTx(
      tx,
      context,
      cid,
      'TELEPHONY_MANUAL_CALL_RECORDED',
      saved.id,
      correlationId,
      { lead_id: lead.lead.id, source: 'MANUAL_UPLOAD' },
    );
    return saved;
  }

  private async assertRecordingConsent(
    cid: string,
    contactId: string,
    consentId: string,
  ): Promise<void> {
    const [consent] = await this.connection.db
      .select({ id: schema.consentRecords.id })
      .from(schema.consentRecords)
      .where(
        and(
          eq(schema.consentRecords.clientOrganizationId, cid),
          eq(schema.consentRecords.id, consentId),
          eq(schema.consentRecords.contactId, contactId),
          eq(schema.consentRecords.purpose, 'CALL_RECORDING'),
          eq(schema.consentRecords.status, 'GRANTED'),
          isNull(schema.consentRecords.withdrawnAt),
        ),
      )
      .limit(1);
    if (!consent)
      throw conflict('RECORDING_CONSENT_REQUIRED', 'A current recording consent is required.');
  }

  private async recordingRetentionExpiry(tx: Tx, cid: string, recordedAt: string): Promise<Date> {
    const [settings] = await tx
      .select({ retentionPolicy: schema.clientAdministrationSettings.retentionPolicy })
      .from(schema.clientAdministrationSettings)
      .where(eq(schema.clientAdministrationSettings.clientOrganizationId, cid))
      .limit(1);
    const configuredDays = settings?.retentionPolicy.recording_days;
    const days =
      typeof configuredDays === 'number' &&
      Number.isInteger(configuredDays) &&
      configuredDays >= 1 &&
      configuredDays <= 3_650
        ? configuredDays
        : 180;
    return new Date(new Date(recordedAt).getTime() + days * 24 * 60 * 60 * 1_000);
  }

  private async presentManualRecordingUpload(
    context: AuthorizationContext,
    receipt: ManualRecordingUploadReceipt,
    replayed: boolean,
  ) {
    const cid = clientId(context);
    const [recording] = await this.connection.db
      .select({
        checksumSha256: schema.callRecordings.checksumSha256,
        contentLength: schema.callRecordings.sizeBytes,
        contentType: schema.callRecordings.mimeType,
        objectKey: schema.callRecordings.objectKey,
        callId: schema.callRecordings.callId,
      })
      .from(schema.callRecordings)
      .where(
        and(
          eq(schema.callRecordings.clientOrganizationId, cid),
          eq(schema.callRecordings.id, receipt.recording_id),
          eq(schema.callRecordings.source, 'MANUAL_UPLOAD'),
        ),
      )
      .limit(1);
    if (!recording?.objectKey || !recording.contentType || !recording.contentLength)
      throw notFound('Manual recording upload not found.');
    await this.accessibleCall(context, recording.callId);
    const upload = await this.storage.createUploadUrl({
      ...(recording.checksumSha256 ? { checksumSha256: recording.checksumSha256 } : {}),
      contentLength: recording.contentLength,
      contentType: recording.contentType,
      expiresInSeconds: this.config.recordingUrlTtlSeconds,
      key: recording.objectKey,
    });
    return { ...receipt, replayed, upload };
  }

  /**
   * Provider inbound events may create a CRM call only with an explicit signed Lead mapping.
   * Unknown callers remain failed webhook receipts; we never guess a Contact or opportunity.
   */
  private async createInboundProviderCallIfMapped(
    tx: Tx,
    connection: ConnectionRow,
    event: NormalizedCallEvent,
  ): Promise<void> {
    if (event.direction !== 'INBOUND' || !event.leadId) return;
    const cid = connection.clientOrganizationId;
    const [existing] = await tx
      .select({ id: schema.calls.id })
      .from(schema.calls)
      .where(
        and(
          eq(schema.calls.clientOrganizationId, cid),
          eq(schema.calls.provider, connection.provider),
          eq(schema.calls.providerCallId, event.providerCallId),
        ),
      )
      .limit(1);
    if (existing) return;
    const [lead] = await tx
      .select({ contact: schema.contacts, lead: schema.leadOpportunities })
      .from(schema.leadOpportunities)
      .innerJoin(
        schema.contacts,
        and(
          eq(schema.contacts.clientOrganizationId, cid),
          eq(schema.contacts.id, schema.leadOpportunities.contactId),
        ),
      )
      .where(
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, event.leadId),
        ),
      )
      .limit(1);
    if (!lead) return;
    const [call] = await tx
      .insert(schema.calls)
      .values({
        clientOrganizationId: cid,
        connectionId: connection.id,
        contactId: lead.contact.id,
        direction: 'INBOUND',
        leadId: lead.lead.id,
        origin: 'PROVIDER',
        provider: connection.provider,
        providerCallId: event.providerCallId,
        providerMetadata: { inbound_lead_mapping: 'PROVIDER_SIGNED' },
        status: 'REQUESTED',
      })
      .returning();
    const saved = requiredResult(call, 'Inbound provider call was not returned.');
    await tx.insert(schema.callParticipants).values({
      callId: saved.id,
      clientOrganizationId: cid,
      contactId: lead.contact.id,
      displayName: lead.contact.displayName,
      phoneE164: lead.contact.primaryPhoneE164,
      role: 'CUSTOMER',
    });
  }

  private async applyProviderEvent(
    tx: Tx,
    connection: ConnectionRow,
    event: NormalizedCallEvent,
    webhookEventId: string | undefined,
    correlationId: string,
  ): Promise<boolean> {
    const cid = connection.clientOrganizationId;
    const [existingEvent] = await tx
      .select({ id: schema.callEvents.id })
      .from(schema.callEvents)
      .where(
        and(
          eq(schema.callEvents.clientOrganizationId, cid),
          eq(schema.callEvents.provider, connection.provider),
          eq(schema.callEvents.providerEventId, event.externalEventId),
        ),
      )
      .limit(1);
    if (existingEvent) return false;
    const [call] = await tx
      .select()
      .from(schema.calls)
      .where(
        and(
          eq(schema.calls.clientOrganizationId, cid),
          eq(schema.calls.provider, connection.provider),
          eq(schema.calls.providerCallId, event.providerCallId),
        ),
      )
      .limit(1);
    if (!call) return false;
    const [latest] = await tx
      .select({ occurredAt: schema.callEvents.occurredAt })
      .from(schema.callEvents)
      .where(
        and(
          eq(schema.callEvents.clientOrganizationId, cid),
          eq(schema.callEvents.callId, call.id),
          isNotNull(schema.callEvents.status),
        ),
      )
      .orderBy(desc(schema.callEvents.occurredAt))
      .limit(1);
    const shouldUpdateCall = !latest || event.occurredAt >= latest.occurredAt;
    await tx.insert(schema.callEvents).values({
      callId: call.id,
      clientOrganizationId: cid,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      payload: {
        ...(event.durationSeconds === undefined ? {} : { duration_seconds: event.durationSeconds }),
        provider_call_id: event.providerCallId,
      },
      provider: connection.provider,
      providerEventId: event.externalEventId,
      status: event.status,
      webhookEventId: webhookEventId ?? null,
    });
    if (shouldUpdateCall) {
      const outcomeRequirement =
        event.status === 'COMPLETED' &&
        call.outcomeRequirement !== 'RECORDED' &&
        call.outcomeRequirement !== 'EXCEPTION'
          ? 'REQUIRED'
          : call.outcomeRequirement;
      await tx
        .update(schema.calls)
        .set({
          ...(event.durationSeconds === undefined
            ? {}
            : { durationSeconds: event.durationSeconds }),
          ...(event.status === 'ANSWERED' ? { answeredAt: event.occurredAt } : {}),
          ...(event.status === 'COMPLETED' ||
          event.status === 'FAILED' ||
          event.status === 'CANCELLED'
            ? { endedAt: event.occurredAt }
            : {}),
          outcomeRequirement,
          status: event.status,
          updatedAt: new Date(),
        })
        .where(eq(schema.calls.id, call.id));
    }
    if (event.recording) {
      await tx
        .insert(schema.callRecordings)
        .values({
          availability: 'PENDING',
          callId: call.id,
          clientOrganizationId: cid,
          providerRecordingId: event.recording.providerRecordingId,
          providerRecordingReference: event.recording.providerRecordingReference ?? null,
          recordedAt: event.recording.recordedAt ?? event.occurredAt,
          source: 'PROVIDER',
        })
        .onConflictDoNothing();
    }
    await this.event(tx, cid, call.id, 'TELEPHONY_PROVIDER_EVENT_APPLIED', correlationId, {
      event_id: event.externalEventId,
      status: event.status,
    });
    await this.auditTx(
      tx,
      undefined,
      cid,
      'TELEPHONY_PROVIDER_EVENT_APPLIED',
      call.id,
      correlationId,
      {
        event_id: event.externalEventId,
        status: event.status,
      },
    );
    return true;
  }

  private async accessibleCall(context: AuthorizationContext, callId: string): Promise<CallRow> {
    const cid = clientId(context);
    const [row] = await this.connection.db
      .select({
        call: schema.calls,
        departmentId: schema.teams.departmentId,
        lead: schema.leadOpportunities,
        teamId: schema.assignmentQueues.teamId,
      })
      .from(schema.calls)
      .innerJoin(
        schema.leadOpportunities,
        and(
          eq(schema.leadOpportunities.clientOrganizationId, cid),
          eq(schema.leadOpportunities.id, schema.calls.leadId),
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
      .where(and(eq(schema.calls.clientOrganizationId, cid), eq(schema.calls.id, callId)))
      .limit(1);
    if (!row || !this.canAccess(context, row.lead, row.teamId, row.departmentId))
      throw notFound('Call not found.');
    return row.call;
  }

  private async accessibleLead(context: AuthorizationContext, leadId: string) {
    const cid = clientId(context);
    const [row] = await this.connection.db
      .select({
        contact: schema.contacts,
        departmentId: schema.teams.departmentId,
        lead: schema.leadOpportunities,
        teamId: schema.assignmentQueues.teamId,
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
    return row;
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

  private async activeDevelopmentConnection(cid: string): Promise<ConnectionRow> {
    const [connection] = await this.connection.db
      .select()
      .from(schema.telephonyProviderConnections)
      .where(
        and(
          eq(schema.telephonyProviderConnections.clientOrganizationId, cid),
          eq(schema.telephonyProviderConnections.provider, 'DEVELOPMENT'),
          eq(schema.telephonyProviderConnections.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    if (!connection)
      throw new ServiceUnavailableException({
        code: 'PROVIDER_UNAVAILABLE',
        details: [],
        message:
          'No active telephony provider connection is configured. Use tel: fallback if appropriate.',
        retryable: false,
      });
    return connection;
  }

  private presentConnection(connection: ConnectionRow) {
    return {
      connection: {
        connection_key: connection.connectionKey,
        display_name: connection.displayName,
        last_health_at: connection.lastHealthAt?.toISOString() ?? null,
        last_reconciled_at: connection.lastReconciledAt?.toISOString() ?? null,
        last_webhook_at: connection.lastWebhookAt?.toISOString() ?? null,
        provider: connection.provider,
        status: connection.status,
      },
    };
  }

  private presentCall(call: CallRow) {
    return {
      contact_id: call.contactId,
      created_at: call.createdAt.toISOString(),
      direction: call.direction,
      duration_seconds: call.durationSeconds,
      ended_at: call.endedAt?.toISOString() ?? null,
      id: call.id,
      lead_id: call.leadId,
      origin: call.origin,
      outcome_requirement: call.outcomeRequirement,
      provider: call.provider,
      provider_call_id: call.providerCallId,
      started_at: call.startedAt?.toISOString() ?? null,
      status: call.status,
    };
  }

  private async commandReceipt<T>(
    cid: string,
    provider: string,
    key: string,
    request: unknown,
  ): Promise<T | undefined> {
    const [receipt] = await this.connection.db
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
    if (!receipt) return undefined;
    if (receipt.requestFingerprint !== fingerprint(request))
      throw conflict('IDEMPOTENCY_MISMATCH', 'This idempotency key was used for another request.');
    return receipt.responseSnapshot as T;
  }

  private async storeCommandReceipt(
    cid: string,
    provider: string,
    key: string,
    request: unknown,
    response: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.connection.db.insert(schema.leadIngestionReceipts).values({
        clientOrganizationId: cid,
        externalEventId: key,
        provider,
        requestFingerprint: fingerprint(request),
        responseSnapshot: response,
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const replay = await this.commandReceipt<Record<string, unknown>>(
        cid,
        provider,
        key,
        request,
      );
      if (!replay) throw error;
    }
  }

  private async event(
    tx: Tx,
    cid: string,
    callId: string,
    eventType: string,
    correlationId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(schema.outboxEvents).values({
      aggregateId: callId,
      aggregateType: 'CALL',
      clientOrganizationId: cid,
      correlationId,
      eventType,
      payload,
      scope: 'CLIENT',
    });
  }

  private async audit(
    actor: AuthorizationContext | undefined,
    cid: string,
    action: string,
    entityId: string,
    correlationId: string,
    newSummary: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    await this.auditTx(undefined, actor, cid, action, entityId, correlationId, newSummary, reason);
  }

  private async auditTx(
    tx: Tx | undefined,
    actor: AuthorizationContext | undefined,
    cid: string,
    action: string,
    entityId: string,
    correlationId: string,
    newSummary: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    const target = tx ?? this.connection.db;
    await target.insert(schema.auditEvents).values({
      action,
      actorId: actor?.userId ?? null,
      actorType: actor ? 'USER' : 'PROVIDER',
      clientOrganizationId: cid,
      correlationId,
      effectiveRole: actor?.roleCode ?? 'TELEPHONY_PROVIDER',
      entityId,
      entityType: 'CALL',
      newSummary,
      outcome: 'SUCCESS',
      reason: reason ?? null,
      scope: 'CLIENT',
    });
  }
}
