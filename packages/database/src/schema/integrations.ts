import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { memberships } from './authorization.js';
import { calls, callRecordings } from './telephony.js';
import { clientOrganizations } from './organizations.js';

export const integrationConnectionStatusEnum = pgEnum('integration_connection_status', [
  'PENDING_APPROVAL',
  'ACTIVE',
  'DEGRADED',
  'DISCONNECTED',
]);
export const creativeAssetStatusEnum = pgEnum('creative_asset_status', [
  'GENERATED',
  'MODERATION_PENDING',
  'REVIEW_PENDING',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
]);
export const transcriptSuggestionStatusEnum = pgEnum('transcript_suggestion_status', [
  'REVIEW_PENDING',
  'ACCEPTED',
  'REJECTED',
]);

export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    status: integrationConnectionStatusEnum('status').default('PENDING_APPROVAL').notNull(),
    credentialCiphertext: text('credential_ciphertext'),
    credentialKeyId: varchar('credential_key_id', { length: 64 }),
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'date' }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true, mode: 'date' }),
    failureSummary: text('failure_summary'),
    webhookState: varchar('webhook_state', { length: 32 }).default('NOT_VERIFIED').notNull(),
    quotaState: jsonb('quota_state').$type<Record<string, unknown>>().default({}).notNull(),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'integration_connections_client_fk',
    }).onDelete('restrict'),
    uniqueIndex('integration_connections_provider_uidx').on(
      table.clientOrganizationId,
      table.provider,
    ),
    index('integration_connections_status_idx').on(table.clientOrganizationId, table.status),
  ],
);

export const onboardingChecklistItems = pgTable(
  'onboarding_checklist_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    itemCode: varchar('item_code', { length: 80 }).notNull(),
    complete: boolean('complete').default(false).notNull(),
    evidence: text('evidence'),
    completedByMembershipId: uuid('completed_by_membership_id'),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'onboarding_checklist_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.completedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'onboarding_checklist_actor_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('onboarding_checklist_item_uidx').on(table.clientOrganizationId, table.itemCode),
  ],
);

export const generatedCreativeAssets = pgTable(
  'generated_creative_assets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    requestedByMembershipId: uuid('requested_by_membership_id').notNull(),
    brandProfile: varchar('brand_profile', { length: 240 }).notNull(),
    brandTemplate: varchar('brand_template', { length: 240 }).notNull(),
    brief: text('brief').notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    status: creativeAssetStatusEnum('status').default('MODERATION_PENDING').notNull(),
    objectKey: text('object_key'),
    moderationSummary: text('moderation_summary'),
    reviewedByMembershipId: uuid('reviewed_by_membership_id'),
    reviewReason: text('review_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'creative_assets_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.requestedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'creative_assets_requester_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.reviewedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'creative_assets_reviewer_tenant_fk',
    }).onDelete('restrict'),
    check(
      'creative_assets_review_check',
      sql`${table.status} not in ('APPROVED', 'REJECTED', 'PUBLISHED') or ${table.reviewedAt} is not null`,
    ),
    index('creative_assets_status_idx').on(table.clientOrganizationId, table.status),
  ],
);

export const callTranscriptSuggestions = pgTable(
  'call_transcript_suggestions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    callId: uuid('call_id').notNull(),
    recordingId: uuid('recording_id').notNull(),
    transcript: text('transcript').notNull(),
    summary: text('summary').notNull(),
    suggestions: jsonb('suggestions').$type<Record<string, string>[]>().notNull(),
    status: transcriptSuggestionStatusEnum('status').default('REVIEW_PENDING').notNull(),
    reviewedByMembershipId: uuid('reviewed_by_membership_id'),
    reviewReason: text('review_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.callId],
      foreignColumns: [calls.clientOrganizationId, calls.id],
      name: 'call_transcript_call_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.recordingId],
      foreignColumns: [callRecordings.id],
      name: 'call_transcript_recording_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.reviewedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'call_transcript_reviewer_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('call_transcript_recording_uidx').on(table.clientOrganizationId, table.recordingId),
    index('call_transcript_status_idx').on(table.clientOrganizationId, table.status),
  ],
);
