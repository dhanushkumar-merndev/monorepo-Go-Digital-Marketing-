import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { memberships } from './authorization.js';
import { consentRecords, contacts, leadFollowUps, leadOpportunities } from './leads.js';
import { clientOrganizations } from './organizations.js';
import { users } from './users.js';

export const telephonyConnectionStatusEnum = pgEnum('telephony_connection_status', [
  'ACTIVE',
  'DISABLED',
  'PENDING_APPROVAL',
  'DEGRADED',
]);
export const telephonyCallDirectionEnum = pgEnum('telephony_call_direction', [
  'INBOUND',
  'OUTBOUND',
]);
export const telephonyCallOriginEnum = pgEnum('telephony_call_origin', [
  'PROVIDER',
  'TEL_FALLBACK',
  'MANUAL_UPLOAD',
]);
export const telephonyCallStatusEnum = pgEnum('telephony_call_status', [
  'REQUESTED',
  'RINGING',
  'ANSWERED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'UNKNOWN',
]);
export const telephonyOutcomeRequirementEnum = pgEnum('telephony_outcome_requirement', [
  'NOT_REQUIRED',
  'REQUIRED',
  'RECORDED',
  'EXCEPTION',
]);
export const telephonyParticipantRoleEnum = pgEnum('telephony_participant_role', [
  'AGENT',
  'CUSTOMER',
  'OTHER',
]);
export const telephonyCallOutcomeEnum = pgEnum('telephony_call_outcome', [
  'INTERESTED',
  'CALLBACK',
  'TEST_RIDE_REQUESTED',
  'SHOWROOM_VISIT',
  'NO_ANSWER',
  'BUSY',
  'WRONG_NUMBER',
  'NOT_INTERESTED',
  'ALREADY_PURCHASED',
  'OTHER',
]);
export const telephonyRecordingAvailabilityEnum = pgEnum('telephony_recording_availability', [
  'PENDING',
  'AVAILABLE',
  'UNAVAILABLE',
  'EXPIRED',
]);
export const telephonyRecordingSourceEnum = pgEnum('telephony_recording_source', [
  'PROVIDER',
  'MANUAL_UPLOAD',
]);
export const telephonyReconciliationStatusEnum = pgEnum('telephony_reconciliation_status', [
  'RUNNING',
  'COMPLETED',
  'FAILED',
]);

/** Tenant-scoped provider configuration. Secrets stay in an external encrypted secret reference. */
export const telephonyProviderConnections = pgTable(
  'telephony_provider_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    connectionKey: varchar('connection_key', { length: 128 }).notNull(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    status: telephonyConnectionStatusEnum('status').default('PENDING_APPROVAL').notNull(),
    secretReference: varchar('secret_reference', { length: 500 }),
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),
    lastHealthAt: timestamp('last_health_at', { withTimezone: true, mode: 'date' }),
    lastHealthStatus: varchar('last_health_status', { length: 32 }),
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true, mode: 'date' }),
    lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'telephony_connections_client_fk',
    }).onDelete('restrict'),
    unique('telephony_connections_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('telephony_connections_client_provider_uidx').on(
      table.clientOrganizationId,
      table.provider,
    ),
    uniqueIndex('telephony_connections_key_uidx').on(table.connectionKey),
    index('telephony_connections_client_status_idx').on(table.clientOrganizationId, table.status),
  ],
);

/** Canonical call record. It always belongs to the existing Phase 3 Lead and Contact. */
export const calls = pgTable(
  'calls',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    connectionId: uuid('connection_id'),
    provider: varchar('provider', { length: 64 }).notNull(),
    providerCallId: varchar('provider_call_id', { length: 256 }),
    origin: telephonyCallOriginEnum('origin').notNull(),
    direction: telephonyCallDirectionEnum('direction').notNull(),
    status: telephonyCallStatusEnum('status').default('REQUESTED').notNull(),
    outcomeRequirement: telephonyOutcomeRequirementEnum('outcome_requirement')
      .default('NOT_REQUIRED')
      .notNull(),
    initiatedByUserId: uuid('initiated_by_user_id'),
    initiatedByMembershipId: uuid('initiated_by_membership_id'),
    virtualNumber: varchar('virtual_number', { length: 32 }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    answeredAt: timestamp('answered_at', { withTimezone: true, mode: 'date' }),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    durationSeconds: integer('duration_seconds'),
    providerMetadata: jsonb('provider_metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'calls_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'calls_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.connectionId],
      foreignColumns: [
        telephonyProviderConnections.clientOrganizationId,
        telephonyProviderConnections.id,
      ],
      name: 'calls_connection_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.initiatedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'calls_initiator_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.initiatedByUserId],
      foreignColumns: [users.id],
      name: 'calls_initiator_user_fk',
    }).onDelete('restrict'),
    unique('calls_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('calls_provider_call_uidx')
      .on(table.clientOrganizationId, table.provider, table.providerCallId)
      .where(sql`${table.providerCallId} is not null`),
    index('calls_lead_created_idx').on(table.clientOrganizationId, table.leadId, table.createdAt),
    index('calls_outcome_queue_idx').on(
      table.clientOrganizationId,
      table.outcomeRequirement,
      table.endedAt,
    ),
    check(
      'calls_duration_check',
      sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`,
    ),
    check(
      'calls_completed_outcome_requirement_check',
      sql`${table.status} <> 'COMPLETED' or ${table.outcomeRequirement} in ('REQUIRED', 'RECORDED', 'EXCEPTION')`,
    ),
  ],
);

export const callParticipants = pgTable(
  'call_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    callId: uuid('call_id').notNull(),
    role: telephonyParticipantRoleEnum('role').notNull(),
    contactId: uuid('contact_id'),
    membershipId: uuid('membership_id'),
    userId: uuid('user_id'),
    phoneE164: varchar('phone_e164', { length: 32 }),
    displayName: varchar('display_name', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.callId],
      foreignColumns: [calls.clientOrganizationId, calls.id],
      name: 'call_participants_call_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'call_participants_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.membershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'call_participants_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'call_participants_user_fk',
    }).onDelete('restrict'),
    index('call_participants_call_idx').on(table.clientOrganizationId, table.callId),
    check(
      'call_participants_customer_contact_check',
      sql`${table.role} <> 'CUSTOMER' or ${table.contactId} is not null`,
    ),
  ],
);

/** Append-only provider and manual call evidence. Provider event identifiers are idempotent per tenant. */
export const callEvents = pgTable(
  'call_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    callId: uuid('call_id').notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 256 }),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    status: telephonyCallStatusEnum('status'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    webhookEventId: uuid('webhook_event_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.callId],
      foreignColumns: [calls.clientOrganizationId, calls.id],
      name: 'call_events_call_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('call_events_provider_event_uidx')
      .on(table.clientOrganizationId, table.provider, table.providerEventId)
      .where(sql`${table.providerEventId} is not null`),
    index('call_events_call_occurred_idx').on(
      table.clientOrganizationId,
      table.callId,
      table.occurredAt,
    ),
  ],
);

export const callRecordings = pgTable(
  'call_recordings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    callId: uuid('call_id').notNull(),
    providerRecordingId: varchar('provider_recording_id', { length: 256 }),
    providerRecordingReference: varchar('provider_recording_reference', { length: 500 }),
    source: telephonyRecordingSourceEnum('source').default('PROVIDER').notNull(),
    objectKey: varchar('object_key', { length: 1024 }),
    originalFilename: varchar('original_filename', { length: 180 }),
    mimeType: varchar('mime_type', { length: 128 }),
    sizeBytes: integer('size_bytes'),
    checksumSha256: varchar('checksum_sha256', { length: 128 }),
    uploadedByUserId: uuid('uploaded_by_user_id'),
    uploadedByMembershipId: uuid('uploaded_by_membership_id'),
    uploadNotes: text('upload_notes'),
    availability: telephonyRecordingAvailabilityEnum('availability').default('PENDING').notNull(),
    consentRecordId: uuid('consent_record_id'),
    retentionExpiresAt: timestamp('retention_expires_at', { withTimezone: true, mode: 'date' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.callId],
      foreignColumns: [calls.clientOrganizationId, calls.id],
      name: 'call_recordings_call_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.consentRecordId],
      foreignColumns: [consentRecords.clientOrganizationId, consentRecords.id],
      name: 'call_recordings_consent_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.uploadedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'call_recordings_uploader_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.uploadedByUserId],
      foreignColumns: [users.id],
      name: 'call_recordings_uploader_user_fk',
    }).onDelete('restrict'),
    uniqueIndex('call_recordings_provider_uidx')
      .on(table.clientOrganizationId, table.providerRecordingId)
      .where(sql`${table.providerRecordingId} is not null`),
    index('call_recordings_call_idx').on(table.clientOrganizationId, table.callId),
    check(
      'call_recordings_available_consent_check',
      sql`${table.availability} <> 'AVAILABLE' or (${table.consentRecordId} is not null and ${table.retentionExpiresAt} is not null)`,
    ),
    check(
      'call_recordings_manual_upload_metadata_check',
      sql`${table.source} <> 'MANUAL_UPLOAD' or (${table.objectKey} is not null and ${table.originalFilename} is not null and ${table.mimeType} is not null and ${table.sizeBytes} is not null and ${table.uploadedByUserId} is not null and ${table.uploadedByMembershipId} is not null)`,
    ),
    check(
      'call_recordings_size_bytes_check',
      sql`${table.sizeBytes} is null or ${table.sizeBytes} >= 0`,
    ),
  ],
);

export const callOutcomes = pgTable(
  'call_outcomes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    callId: uuid('call_id').notNull(),
    outcome: telephonyCallOutcomeEnum('outcome').notNull(),
    note: text('note'),
    callbackFollowUpId: uuid('callback_follow_up_id'),
    recordedByUserId: uuid('recorded_by_user_id').notNull(),
    recordedByMembershipId: uuid('recorded_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.callId],
      foreignColumns: [calls.clientOrganizationId, calls.id],
      name: 'call_outcomes_call_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.callbackFollowUpId],
      foreignColumns: [leadFollowUps.clientOrganizationId, leadFollowUps.id],
      name: 'call_outcomes_follow_up_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.recordedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'call_outcomes_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.recordedByUserId],
      foreignColumns: [users.id],
      name: 'call_outcomes_user_fk',
    }).onDelete('restrict'),
    uniqueIndex('call_outcomes_call_uidx').on(table.clientOrganizationId, table.callId),
    index('call_outcomes_client_created_idx').on(table.clientOrganizationId, table.createdAt),
  ],
);

export const callOutcomeExceptions = pgTable(
  'call_outcome_exceptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    callId: uuid('call_id').notNull(),
    reason: text('reason').notNull(),
    approvedByUserId: uuid('approved_by_user_id').notNull(),
    approvedByMembershipId: uuid('approved_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.callId],
      foreignColumns: [calls.clientOrganizationId, calls.id],
      name: 'call_outcome_exceptions_call_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.approvedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'call_outcome_exceptions_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.approvedByUserId],
      foreignColumns: [users.id],
      name: 'call_outcome_exceptions_user_fk',
    }).onDelete('restrict'),
    uniqueIndex('call_outcome_exceptions_call_uidx').on(table.clientOrganizationId, table.callId),
  ],
);

/** Immutable reconciliation run evidence, including recovered event count. */
export const telephonyReconciliations = pgTable(
  'telephony_reconciliations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    connectionId: uuid('connection_id').notNull(),
    status: telephonyReconciliationStatusEnum('status').default('RUNNING').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    cursor: varchar('cursor', { length: 512 }),
    recoveredEvents: integer('recovered_events').default(0).notNull(),
    processedCalls: integer('processed_calls').default(0).notNull(),
    errorCode: varchar('error_code', { length: 100 }),
    errorMessage: text('error_message'),
    initiatedByUserId: uuid('initiated_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.connectionId],
      foreignColumns: [
        telephonyProviderConnections.clientOrganizationId,
        telephonyProviderConnections.id,
      ],
      name: 'telephony_reconciliations_connection_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.initiatedByUserId],
      foreignColumns: [users.id],
      name: 'telephony_reconciliations_user_fk',
    }).onDelete('restrict'),
    index('telephony_reconciliations_client_started_idx').on(
      table.clientOrganizationId,
      table.startedAt,
    ),
    check(
      'telephony_reconciliations_counts_check',
      sql`${table.recoveredEvents} >= 0 and ${table.processedCalls} >= 0`,
    ),
  ],
);
