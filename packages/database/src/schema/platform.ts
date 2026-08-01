import { sql } from 'drizzle-orm';
import {
  check,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const eventScopeEnum = pgEnum('event_scope', ['PLATFORM', 'CLIENT']);
export const outboxStatusEnum = pgEnum('outbox_status', [
  'PENDING',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'DEAD_LETTER',
]);
export const webhookStatusEnum = pgEnum('webhook_status', [
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'DUPLICATE',
  'FAILED',
  'DEAD_LETTER',
]);
export const auditOutcomeEnum = pgEnum('audit_outcome', ['SUCCESS', 'DENIED', 'FAILURE']);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scope: eventScopeEnum('scope').notNull(),
    clientOrganizationId: uuid('client_organization_id'),
    aggregateType: varchar('aggregate_type', { length: 100 }).notNull(),
    aggregateId: varchar('aggregate_id', { length: 128 }).notNull(),
    eventType: varchar('event_type', { length: 160 }).notNull(),
    eventVersion: integer('event_version').default(1).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    status: outboxStatusEnum('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    lockedBy: varchar('locked_by', { length: 128 }),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    lastErrorCode: varchar('last_error_code', { length: 100 }),
    lastErrorMessage: text('last_error_message'),
  },
  (table) => [
    check(
      'outbox_events_scope_client_check',
      sql`(${table.scope} = 'PLATFORM' AND ${table.clientOrganizationId} IS NULL) OR (${table.scope} = 'CLIENT' AND ${table.clientOrganizationId} IS NOT NULL)`,
    ),
    check('outbox_events_attempts_check', sql`${table.attempts} >= 0`),
    check('outbox_events_version_check', sql`${table.eventVersion} >= 1`),
    index('outbox_events_pending_idx').on(table.status, table.availableAt),
    index('outbox_events_client_occurred_idx').on(table.clientOrganizationId, table.occurredAt),
    index('outbox_events_aggregate_idx').on(
      table.clientOrganizationId,
      table.aggregateType,
      table.aggregateId,
    ),
  ],
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    externalEventId: varchar('external_event_id', { length: 256 }).notNull(),
    eventType: varchar('event_type', { length: 160 }).notNull(),
    status: webhookStatusEnum('status').default('RECEIVED').notNull(),
    signatureVerifiedAt: timestamp('signature_verified_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    normalizedPayload: jsonb('normalized_payload').$type<Record<string, unknown> | null>(),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'date' }),
    rawPayloadExpiresAt: timestamp('raw_payload_expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    lastErrorCode: varchar('last_error_code', { length: 100 }),
    lastErrorMessage: text('last_error_message'),
  },
  (table) => [
    uniqueIndex('webhook_events_client_provider_external_uidx').on(
      table.clientOrganizationId,
      table.provider,
      table.externalEventId,
    ),
    check('webhook_events_attempts_check', sql`${table.attempts} >= 0`),
    index('webhook_events_processing_idx').on(table.status, table.availableAt),
    index('webhook_events_client_received_idx').on(table.clientOrganizationId, table.receivedAt),
    index('webhook_events_payload_expiry_idx').on(table.rawPayloadExpiresAt),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scope: eventScopeEnum('scope').notNull(),
    clientOrganizationId: uuid('client_organization_id'),
    actorId: varchar('actor_id', { length: 128 }),
    actorType: varchar('actor_type', { length: 64 }).notNull(),
    effectiveRole: varchar('effective_role', { length: 100 }),
    action: varchar('action', { length: 160 }).notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: varchar('entity_id', { length: 128 }).notNull(),
    outcome: auditOutcomeEnum('outcome').notNull(),
    oldSummary: jsonb('old_summary').$type<Record<string, unknown> | null>(),
    newSummary: jsonb('new_summary').$type<Record<string, unknown> | null>(),
    reason: text('reason'),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    sourceIp: inet('source_ip'),
    userAgent: text('user_agent'),
    deviceId: varchar('device_id', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'audit_events_scope_client_check',
      sql`(${table.scope} = 'PLATFORM' AND ${table.clientOrganizationId} IS NULL) OR (${table.scope} = 'CLIENT' AND ${table.clientOrganizationId} IS NOT NULL)`,
    ),
    index('audit_events_client_created_idx').on(table.clientOrganizationId, table.createdAt),
    index('audit_events_entity_idx').on(
      table.clientOrganizationId,
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
    index('audit_events_actor_idx').on(table.actorId, table.createdAt),
    index('audit_events_correlation_idx').on(table.correlationId),
  ],
);
