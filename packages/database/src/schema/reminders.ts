import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { contacts } from './leads.js';
import { messageTemplates } from './messaging.js';
import { clientOrganizations } from './organizations.js';
import { customerVehicles } from './registration.js';

export const reminderTypeEnum = pgEnum('reminder_type', [
  'SERVICE_DUE',
  'INSURANCE_EXPIRY',
  'PUC_EXPIRY',
  'WARRANTY_EXPIRY',
  'AMC_EXPIRY',
  'ROADSIDE_ASSISTANCE_EXPIRY',
  'RC_PENDING',
  'SERVICE_APPOINTMENT',
  'EXCHANGE_ELIGIBILITY',
  'UPGRADE_OPPORTUNITY',
]);
export const reminderCategoryEnum = pgEnum('reminder_communication_category', [
  'OPERATIONAL',
  'MARKETING',
]);
export const reminderThresholdKindEnum = pgEnum('reminder_threshold_kind', ['DATE', 'KILOMETRE']);
export const reminderBaseDateFieldEnum = pgEnum('reminder_base_date_field', [
  'DELIVERY_DATE',
  'PURCHASE_DATE',
  'INSURANCE_EXPIRY',
  'PUC_EXPIRY',
  'WARRANTY_EXPIRY',
  'AMC_EXPIRY',
  'RSA_EXPIRY',
]);
export const reminderStatusEnum = pgEnum('reminder_status', [
  'SCHEDULED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'SUPPRESSED',
]);
export const reminderOutboxStatusEnum = pgEnum('reminder_outbox_status', [
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'DEAD_LETTER',
]);
export const customerActivityTypeEnum = pgEnum('customer_activity_type', [
  'FEEDBACK',
  'COMPLAINT',
  'ESCALATION',
  'REMINDER',
]);

export const reminderDefinitions = pgTable(
  'reminder_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    type: reminderTypeEnum('type').notNull(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    defaultCategory: reminderCategoryEnum('default_category').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
    }).onDelete('restrict'),
    unique('reminder_definitions_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('reminder_definitions_type_uidx').on(table.clientOrganizationId, table.type),
  ],
);

export const reminderRuleTemplates = pgTable(
  'reminder_rule_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    reminderDefinitionId: uuid('reminder_definition_id').notNull(),
    brandName: varchar('brand_name', { length: 120 }),
    modelName: varchar('model_name', { length: 120 }),
    variantName: varchar('variant_name', { length: 160 }),
    modelYear: integer('model_year'),
    thresholdKind: reminderThresholdKindEnum('threshold_kind').notNull(),
    baseDateField: reminderBaseDateFieldEnum('base_date_field'),
    dueAfterDays: integer('due_after_days'),
    dueKilometres: integer('due_kilometres'),
    noticeDays: jsonb('notice_days').$type<number[]>().default([30, 15, 7, 1]).notNull(),
    category: reminderCategoryEnum('category').notNull(),
    channel: varchar('channel', { length: 16 }).notNull(),
    templateId: uuid('template_id').notNull(),
    version: integer('version').default(1).notNull(),
    active: boolean('active').default(true).notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.reminderDefinitionId],
      foreignColumns: [reminderDefinitions.clientOrganizationId, reminderDefinitions.id],
      name: 'reminder_rules_definition_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.templateId],
      foreignColumns: [messageTemplates.clientOrganizationId, messageTemplates.id],
      name: 'reminder_rules_template_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'reminder_rules_actor_tenant_fk',
    }).onDelete('restrict'),
    unique('reminder_rules_client_id_unique').on(table.clientOrganizationId, table.id),
    index('reminder_rules_match_idx').on(
      table.clientOrganizationId,
      table.active,
      table.brandName,
      table.modelName,
      table.variantName,
      table.modelYear,
    ),
    check('reminder_rules_version_check', sql`${table.version} >= 1`),
    check('reminder_rules_channel_check', sql`${table.channel} in ('WHATSAPP','EMAIL','SMS')`),
    check(
      'reminder_rules_threshold_check',
      sql`(${table.thresholdKind} = 'DATE' and ${table.baseDateField} is not null and ${table.dueAfterDays} is not null and ${table.dueKilometres} is null) or (${table.thresholdKind} = 'KILOMETRE' and ${table.baseDateField} is null and ${table.dueAfterDays} is null and ${table.dueKilometres} is not null)`,
    ),
  ],
);

export const customerReminderPreferences = pgTable(
  'customer_reminder_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    customerVehicleId: uuid('customer_vehicle_id').notNull(),
    operationalEnabled: boolean('operational_enabled').default(true).notNull(),
    marketingEnabled: boolean('marketing_enabled').default(false).notNull(),
    preferredChannel: varchar('preferred_channel', { length: 16 }).default('WHATSAPP').notNull(),
    version: integer('version').default(1).notNull(),
    updatedByMembershipId: uuid('updated_by_membership_id').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.customerVehicleId],
      foreignColumns: [customerVehicles.clientOrganizationId, customerVehicles.id],
      name: 'reminder_preferences_vehicle_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.updatedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'reminder_preferences_actor_tenant_fk',
    }).onDelete('restrict'),
    unique('reminder_preferences_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('reminder_preferences_vehicle_uidx').on(
      table.clientOrganizationId,
      table.customerVehicleId,
    ),
    check('reminder_preferences_version_check', sql`${table.version} >= 1`),
    check(
      'reminder_preferences_channel_check',
      sql`${table.preferredChannel} in ('WHATSAPP','EMAIL','SMS')`,
    ),
  ],
);

export const customerReminderPlans = pgTable(
  'customer_reminder_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    customerVehicleId: uuid('customer_vehicle_id').notNull(),
    ruleTemplateId: uuid('rule_template_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }),
    dueKilometres: integer('due_kilometres'),
    sourceVehicleVersion: integer('source_vehicle_version').notNull(),
    ruleVersion: integer('rule_version').notNull(),
    scheduleVersion: integer('schedule_version').default(1).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.customerVehicleId],
      foreignColumns: [customerVehicles.clientOrganizationId, customerVehicles.id],
      name: 'reminder_plans_vehicle_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.ruleTemplateId],
      foreignColumns: [reminderRuleTemplates.clientOrganizationId, reminderRuleTemplates.id],
      name: 'reminder_plans_rule_tenant_fk',
    }).onDelete('restrict'),
    unique('reminder_plans_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('reminder_plans_vehicle_rule_uidx').on(
      table.clientOrganizationId,
      table.customerVehicleId,
      table.ruleTemplateId,
    ),
    index('reminder_plans_due_idx').on(table.clientOrganizationId, table.active, table.dueAt),
    check('reminder_plans_schedule_version_check', sql`${table.scheduleVersion} >= 1`),
    check(
      'reminder_plans_due_check',
      sql`(${table.dueAt} is not null and ${table.dueKilometres} is null) or (${table.dueAt} is null and ${table.dueKilometres} is not null)`,
    ),
  ],
);

export const reminderInstances = pgTable(
  'reminder_instances',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    customerReminderPlanId: uuid('customer_reminder_plan_id').notNull(),
    materializationKey: varchar('materialization_key', { length: 200 }).notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }).notNull(),
    status: reminderStatusEnum('status').default('SCHEDULED').notNull(),
    category: reminderCategoryEnum('category').notNull(),
    channel: varchar('channel', { length: 16 }).notNull(),
    templateId: uuid('template_id').notNull(),
    consentReferenceId: uuid('consent_reference_id'),
    retryCount: integer('retry_count').default(0).notNull(),
    suppressionReason: text('suppression_reason'),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.customerReminderPlanId],
      foreignColumns: [customerReminderPlans.clientOrganizationId, customerReminderPlans.id],
      name: 'reminder_instances_plan_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.templateId],
      foreignColumns: [messageTemplates.clientOrganizationId, messageTemplates.id],
      name: 'reminder_instances_template_tenant_fk',
    }).onDelete('restrict'),
    unique('reminder_instances_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('reminder_instances_materialization_uidx').on(
      table.clientOrganizationId,
      table.materializationKey,
    ),
    index('reminder_instances_queue_idx').on(
      table.clientOrganizationId,
      table.status,
      table.scheduledFor,
    ),
    check('reminder_instances_retry_check', sql`${table.retryCount} >= 0`),
    check('reminder_instances_version_check', sql`${table.version} >= 1`),
  ],
);

export const reminderEvents = pgTable(
  'reminder_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    reminderInstanceId: uuid('reminder_instance_id').notNull(),
    fromStatus: reminderStatusEnum('from_status'),
    toStatus: reminderStatusEnum('to_status').notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    reason: text('reason'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    actorMembershipId: uuid('actor_membership_id'),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.reminderInstanceId],
      foreignColumns: [reminderInstances.clientOrganizationId, reminderInstances.id],
      name: 'reminder_events_instance_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'reminder_events_actor_tenant_fk',
    }).onDelete('restrict'),
    index('reminder_events_timeline_idx').on(
      table.clientOrganizationId,
      table.reminderInstanceId,
      table.createdAt,
    ),
  ],
);

export const reminderDispatchOutbox = pgTable(
  'reminder_dispatch_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    reminderInstanceId: uuid('reminder_instance_id').notNull(),
    status: reminderOutboxStatusEnum('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    lockedBy: varchar('locked_by', { length: 128 }),
    providerMessageId: varchar('provider_message_id', { length: 256 }),
    lastErrorCode: varchar('last_error_code', { length: 100 }),
    lastErrorMessage: text('last_error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.reminderInstanceId],
      foreignColumns: [reminderInstances.clientOrganizationId, reminderInstances.id],
      name: 'reminder_outbox_instance_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('reminder_outbox_instance_uidx').on(
      table.clientOrganizationId,
      table.reminderInstanceId,
    ),
    index('reminder_outbox_pending_idx').on(table.status, table.availableAt),
    check('reminder_outbox_attempts_check', sql`${table.attempts} >= 0`),
  ],
);

export const customerActivities = pgTable(
  'customer_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    customerVehicleId: uuid('customer_vehicle_id'),
    activityType: customerActivityTypeEnum('activity_type').notNull(),
    subject: varchar('subject', { length: 240 }).notNull(),
    details: text('details').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    actorMembershipId: uuid('actor_membership_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'customer_activities_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.customerVehicleId],
      foreignColumns: [customerVehicles.clientOrganizationId, customerVehicles.id],
      name: 'customer_activities_vehicle_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'customer_activities_actor_tenant_fk',
    }).onDelete('restrict'),
    index('customer_activities_timeline_idx').on(
      table.clientOrganizationId,
      table.contactId,
      table.occurredAt,
    ),
  ],
);

export const reminderCommandReceipts = pgTable(
  'reminder_command_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    commandType: varchar('command_type', { length: 100 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    responseBody: jsonb('response_body').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
    }).onDelete('restrict'),
    uniqueIndex('reminder_command_receipts_key_uidx').on(
      table.clientOrganizationId,
      table.idempotencyKey,
    ),
  ],
);
