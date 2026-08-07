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
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { memberships } from './authorization.js';
import { branches, clientOrganizations, teams } from './organizations.js';
import { users } from './users.js';

export const leadSourceEnum = pgEnum('lead_source', [
  'META',
  'WHATSAPP_AD',
  'GOOGLE_ADS',
  'WEBSITE',
  'WALK_IN',
  'OTHER',
]);
export const leadEntryMethodEnum = pgEnum('lead_entry_method', [
  'MANUAL',
  'PUBLIC_FORM',
  'PROVIDER',
  'IMPORT',
]);
export const leadStatusEnum = pgEnum('lead_status', [
  'NEW',
  'PENDING_REVIEW',
  'CONTACT_ATTEMPT',
  'ACCEPTED',
  'REJECTED',
  'CONTACTED',
  'INTERESTED',
  'FOLLOW_UP',
  'SHOWROOM_VISIT',
  'TEST_RIDE_REQUESTED',
  'TEST_RIDE_BOOKED',
  'TEST_RIDE_COMPLETED',
  'NEGOTIATION',
  'BOOKING_CONFIRMED',
  'LOST',
  'REOPENED',
]);
export const rejectionReasonEnum = pgEnum('lead_rejection_reason', [
  'INVALID_NUMBER',
  'DUPLICATE',
  'NOT_INTERESTED_FIRST_CONTACT',
  'OUTSIDE_SERVICE_AREA',
  'WRONG_ENQUIRY',
  'ALREADY_PURCHASED',
  'SPAM',
]);
export const lostReasonEnum = pgEnum('lead_lost_reason', [
  'PRICE',
  'FINANCE_REJECTED',
  'MODEL_UNAVAILABLE',
  'COMPETITOR_PURCHASE',
  'POSTPONED',
  'NO_RESPONSE',
  'FAMILY_DECISION',
  'OTHER',
]);
export const assignmentMethodEnum = pgEnum('lead_assignment_method', ['MANUAL', 'ROUND_ROBIN']);
export const queueStrategyEnum = pgEnum('lead_queue_strategy', ['ROUND_ROBIN', 'MANUAL']);
export const slaStateEnum = pgEnum('lead_sla_state', ['OPEN', 'MET', 'WARNING', 'BREACHED']);
export const followUpStatusEnum = pgEnum('follow_up_status', ['OPEN', 'COMPLETED', 'CANCELLED']);
export const taskStatusEnum = pgEnum('lead_task_status', ['OPEN', 'COMPLETED', 'CANCELLED']);
export const duplicateStatusEnum = pgEnum('duplicate_candidate_status', [
  'PENDING',
  'LINKED',
  'KEPT_SEPARATE',
  'DISMISSED',
]);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    primaryPhoneE164: varchar('primary_phone_e164', { length: 20 }).notNull(),
    primaryPhoneLookupHash: varchar('primary_phone_lookup_hash', { length: 64 }).notNull(),
    alternatePhoneE164: varchar('alternate_phone_e164', { length: 20 }),
    alternatePhoneLookupHash: varchar('alternate_phone_lookup_hash', { length: 64 }),
    primaryEmailNormalized: varchar('primary_email_normalized', { length: 320 }),
    canonicalContactId: uuid('canonical_contact_id'),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'contacts_client_fk',
    }).onDelete('restrict'),
    unique('contacts_client_id_unique').on(table.clientOrganizationId, table.id),
    foreignKey({
      columns: [table.clientOrganizationId, table.canonicalContactId],
      foreignColumns: [table.clientOrganizationId, table.id],
      name: 'contacts_canonical_tenant_fk',
    }).onDelete('restrict'),
    index('contacts_client_phone_hash_idx').on(
      table.clientOrganizationId,
      table.primaryPhoneLookupHash,
    ),
    index('contacts_client_alt_phone_hash_idx').on(
      table.clientOrganizationId,
      table.alternatePhoneLookupHash,
    ),
    index('contacts_client_email_idx').on(table.clientOrganizationId, table.primaryEmailNormalized),
    check('contacts_version_check', sql`${table.version} >= 1`),
  ],
);

export const contactChannels = pgTable(
  'contact_channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    channelType: varchar('channel_type', { length: 32 }).notNull(),
    valueNormalized: varchar('value_normalized', { length: 320 }).notNull(),
    lookupHash: varchar('lookup_hash', { length: 64 }),
    isPrimary: boolean('is_primary').default(false).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'contact_channels_contact_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('contact_channels_client_contact_type_value_uidx').on(
      table.clientOrganizationId,
      table.contactId,
      table.channelType,
      table.valueNormalized,
    ),
    index('contact_channels_lookup_idx').on(table.clientOrganizationId, table.lookupHash),
  ],
);

export const consentRecords = pgTable(
  'consent_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    purpose: varchar('purpose', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull(),
    noticeVersion: varchar('notice_version', { length: 64 }).notNull(),
    source: varchar('source', { length: 64 }).notNull(),
    evidence: text('evidence').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'consent_records_contact_tenant_fk',
    }).onDelete('restrict'),
    index('consent_records_contact_purpose_idx').on(
      table.clientOrganizationId,
      table.contactId,
      table.purpose,
      table.capturedAt,
    ),
  ],
);

export const assignmentQueues = pgTable(
  'lead_assignment_queues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    teamId: uuid('team_id'),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    strategy: queueStrategyEnum('strategy').default('ROUND_ROBIN').notNull(),
    sourceRules: jsonb('source_rules').$type<string[]>().default([]).notNull(),
    languageRules: jsonb('language_rules').$type<string[]>().default([]).notNull(),
    maxActiveLeadsPerUser: integer('max_active_leads_per_user').default(50).notNull(),
    active: boolean('active').default(true).notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'lead_assignment_queues_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId, table.teamId],
      foreignColumns: [teams.clientOrganizationId, teams.branchId, teams.id],
      name: 'lead_assignment_queues_team_tenant_fk',
    }).onDelete('restrict'),
    unique('lead_assignment_queues_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('lead_assignment_queues_client_code_uidx').on(
      table.clientOrganizationId,
      table.code,
    ),
    check('lead_assignment_queues_capacity_check', sql`${table.maxActiveLeadsPerUser} >= 1`),
    check('lead_assignment_queues_version_check', sql`${table.version} >= 1`),
  ],
);

export const assignmentQueueMembers = pgTable(
  'lead_assignment_queue_members',
  {
    clientOrganizationId: uuid('client_organization_id').notNull(),
    queueId: uuid('queue_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    lastAssignedAt: timestamp('last_assigned_at', { withTimezone: true, mode: 'date' }),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'lead_assignment_queue_members_pk',
      columns: [table.queueId, table.membershipId],
    }),
    foreignKey({
      columns: [table.clientOrganizationId, table.queueId],
      foreignColumns: [assignmentQueues.clientOrganizationId, assignmentQueues.id],
      name: 'lead_assignment_queue_members_queue_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientOrganizationId, table.membershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'lead_assignment_queue_members_membership_tenant_fk',
    }).onDelete('restrict'),
    index('lead_assignment_queue_members_rotation_idx').on(
      table.clientOrganizationId,
      table.queueId,
      table.active,
      table.lastAssignedAt,
    ),
  ],
);

export const leadSettings = pgTable(
  'lead_settings',
  {
    clientOrganizationId: uuid('client_organization_id').primaryKey(),
    firstActionSlaMinutes: integer('first_action_sla_minutes').default(15).notNull(),
    warningBeforeMinutes: integer('warning_before_minutes').default(5).notNull(),
    outsideHoursPolicy: varchar('outside_hours_policy', { length: 32 })
      .default('NEXT_BUSINESS_HOUR')
      .notNull(),
    version: integer('version').default(1).notNull(),
    updatedBy: uuid('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'lead_settings_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.updatedBy],
      foreignColumns: [users.id],
      name: 'lead_settings_updated_by_fk',
    }).onDelete('restrict'),
    check('lead_settings_sla_check', sql`${table.firstActionSlaMinutes} between 1 and 1440`),
    check(
      'lead_settings_warning_check',
      sql`${table.warningBeforeMinutes} >= 0 and ${table.warningBeforeMinutes} < ${table.firstActionSlaMinutes}`,
    ),
    check('lead_settings_version_check', sql`${table.version} >= 1`),
  ],
);

export const campaignAttributions = pgTable(
  'lead_campaign_attributions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    campaignId: varchar('campaign_id', { length: 256 }),
    campaignName: varchar('campaign_name', { length: 256 }),
    adId: varchar('ad_id', { length: 256 }),
    adSetId: varchar('ad_set_id', { length: 256 }),
    formId: varchar('form_id', { length: 256 }),
    gclid: varchar('gclid', { length: 256 }),
    utmSource: varchar('utm_source', { length: 256 }),
    utmMedium: varchar('utm_medium', { length: 256 }),
    utmCampaign: varchar('utm_campaign', { length: 256 }),
    utmTerm: varchar('utm_term', { length: 256 }),
    utmContent: varchar('utm_content', { length: 256 }),
    pageUrl: text('page_url'),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'lead_campaign_attributions_client_fk',
    }).onDelete('restrict'),
    unique('lead_campaign_attributions_client_id_unique').on(table.clientOrganizationId, table.id),
    index('lead_campaign_attributions_campaign_idx').on(
      table.clientOrganizationId,
      table.campaignName,
      table.utmCampaign,
    ),
  ],
);

export const leadOpportunities = pgTable(
  'lead_opportunities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    assignmentQueueId: uuid('assignment_queue_id'),
    campaignAttributionId: uuid('campaign_attribution_id'),
    source: leadSourceEnum('source').notNull(),
    sourceName: varchar('source_name', { length: 160 }),
    sourceMetadata: jsonb('source_metadata').$type<Record<string, unknown>>().default({}).notNull(),
    entryMethod: leadEntryMethodEnum('entry_method').notNull(),
    externalProvider: varchar('external_provider', { length: 64 }),
    externalLeadId: varchar('external_lead_id', { length: 256 }),
    vehicleInterest: varchar('vehicle_interest', { length: 240 }).notNull(),
    language: varchar('language', { length: 32 }),
    status: leadStatusEnum('status').default('NEW').notNull(),
    rejectionReason: rejectionReasonEnum('rejection_reason'),
    lostReason: lostReasonEnum('lost_reason'),
    relationshipOwnerId: uuid('relationship_owner_id'),
    relationshipOwnerMembershipId: uuid('relationship_owner_membership_id'),
    currentProcessOwnerId: uuid('current_process_owner_id'),
    currentProcessOwnerMembershipId: uuid('current_process_owner_membership_id'),
    conversationOwnerId: uuid('conversation_owner_id'),
    conversationOwnerMembershipId: uuid('conversation_owner_membership_id'),
    nextActionAt: timestamp('next_action_at', { withTimezone: true, mode: 'date' }),
    firstActionAt: timestamp('first_action_at', { withTimezone: true, mode: 'date' }),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true, mode: 'date' }).notNull(),
    slaWarningAt: timestamp('sla_warning_at', { withTimezone: true, mode: 'date' }).notNull(),
    slaState: slaStateEnum('sla_state').default('OPEN').notNull(),
    version: integer('version').default(1).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'lead_opportunities_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'lead_opportunities_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.assignmentQueueId],
      foreignColumns: [assignmentQueues.clientOrganizationId, assignmentQueues.id],
      name: 'lead_opportunities_queue_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.campaignAttributionId],
      foreignColumns: [campaignAttributions.clientOrganizationId, campaignAttributions.id],
      name: 'lead_opportunities_campaign_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.relationshipOwnerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'lead_opportunities_relationship_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.relationshipOwnerId, table.relationshipOwnerMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'lead_opportunities_relationship_user_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.currentProcessOwnerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'lead_opportunities_process_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.currentProcessOwnerId, table.currentProcessOwnerMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'lead_opportunities_process_user_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.conversationOwnerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'lead_opportunities_conversation_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.conversationOwnerId, table.conversationOwnerMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'lead_opportunities_conversation_user_membership_fk',
    }).onDelete('restrict'),
    unique('lead_opportunities_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('lead_opportunities_external_uidx')
      .on(table.clientOrganizationId, table.externalProvider, table.externalLeadId)
      .where(sql`${table.externalLeadId} is not null`),
    index('lead_opportunities_status_owner_next_idx').on(
      table.clientOrganizationId,
      table.status,
      table.currentProcessOwnerId,
      table.nextActionAt,
    ),
    index('lead_opportunities_branch_status_idx').on(
      table.clientOrganizationId,
      table.branchId,
      table.status,
    ),
    index('lead_opportunities_sla_idx').on(
      table.clientOrganizationId,
      table.slaState,
      table.slaDueAt,
    ),
    check('lead_opportunities_version_check', sql`${table.version} >= 1`),
    check(
      'lead_opportunities_other_source_check',
      sql`${table.source} <> 'OTHER' or ${table.sourceName} is not null`,
    ),
  ],
);

export const leadAssignments = pgTable(
  'lead_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    fromMembershipId: uuid('from_membership_id'),
    toMembershipId: uuid('to_membership_id').notNull(),
    method: assignmentMethodEnum('method').notNull(),
    reason: text('reason').notNull(),
    assignedBy: uuid('assigned_by'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_assignments_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.fromMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'lead_assignments_from_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.toMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'lead_assignments_to_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [users.id],
      name: 'lead_assignments_actor_fk',
    }).onDelete('restrict'),
    index('lead_assignments_lead_history_idx').on(
      table.clientOrganizationId,
      table.leadId,
      table.createdAt,
    ),
  ],
);

export const leadStatusHistory = pgTable(
  'lead_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    fromStatus: leadStatusEnum('from_status'),
    toStatus: leadStatusEnum('to_status').notNull(),
    actorId: uuid('actor_id'),
    reason: text('reason').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_status_history_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.actorId],
      foreignColumns: [users.id],
      name: 'lead_status_actor_fk',
    }).onDelete('restrict'),
    index('lead_status_history_search_idx').on(
      table.clientOrganizationId,
      table.toStatus,
      table.createdAt,
    ),
    index('lead_status_history_lead_idx').on(
      table.clientOrganizationId,
      table.leadId,
      table.createdAt,
    ),
  ],
);

export const leadOutcomeEvents = pgTable(
  'lead_outcome_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    eventType: varchar('event_type', { length: 32 }).notNull(),
    rejectionReason: rejectionReasonEnum('rejection_reason'),
    lostReason: lostReasonEnum('lost_reason'),
    reason: text('reason').notNull(),
    canonicalContactId: uuid('canonical_contact_id'),
    canonicalLeadId: uuid('canonical_lead_id'),
    actorId: uuid('actor_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_outcome_events_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.canonicalContactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'lead_outcome_events_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.canonicalLeadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_outcome_events_canonical_lead_tenant_fk',
    }).onDelete('restrict'),
    index('lead_outcome_events_search_idx').on(
      table.clientOrganizationId,
      table.eventType,
      table.createdAt,
    ),
  ],
);

export const leadFollowUps = pgTable(
  'lead_follow_ups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    ownerMembershipId: uuid('owner_membership_id').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    channel: varchar('channel', { length: 32 }).notNull(),
    priority: varchar('priority', { length: 16 }).notNull(),
    purpose: varchar('purpose', { length: 500 }).notNull(),
    note: text('note'),
    outcome: varchar('outcome', { length: 500 }),
    status: followUpStatusEnum('status').default('OPEN').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_follow_ups_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.ownerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'lead_follow_ups_owner_tenant_fk',
    }).onDelete('restrict'),
    index('lead_follow_ups_due_idx').on(table.clientOrganizationId, table.status, table.dueAt),
  ],
);

export const leadNotes = pgTable(
  'lead_notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    authorId: uuid('author_id').notNull(),
    note: text('note').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_notes_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.authorId],
      foreignColumns: [users.id],
      name: 'lead_notes_author_fk',
    }).onDelete('restrict'),
    index('lead_notes_lead_idx').on(table.clientOrganizationId, table.leadId, table.createdAt),
  ],
);

export const leadTasks = pgTable(
  'lead_tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    ownerMembershipId: uuid('owner_membership_id').notNull(),
    title: varchar('title', { length: 240 }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    priority: varchar('priority', { length: 16 }).notNull(),
    status: taskStatusEnum('status').default('OPEN').notNull(),
    createdBy: uuid('created_by').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_tasks_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.ownerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'lead_tasks_owner_tenant_fk',
    }).onDelete('restrict'),
    index('lead_tasks_due_idx').on(table.clientOrganizationId, table.status, table.dueAt),
  ],
);

export const duplicateCandidates = pgTable(
  'lead_duplicate_candidates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    candidateContactId: uuid('candidate_contact_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    matchType: varchar('match_type', { length: 32 }).notNull(),
    score: integer('score').notNull(),
    status: duplicateStatusEnum('status').default('PENDING').notNull(),
    resolvedBy: uuid('resolved_by'),
    resolutionReason: text('resolution_reason'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'lead_duplicate_candidates_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.candidateContactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'lead_duplicate_candidates_candidate_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_duplicate_candidates_lead_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('lead_duplicate_candidates_pair_uidx').on(
      table.clientOrganizationId,
      table.leadId,
      table.candidateContactId,
    ),
    index('lead_duplicate_candidates_queue_idx').on(
      table.clientOrganizationId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const slaTimers = pgTable(
  'lead_sla_timers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    warningAt: timestamp('warning_at', { withTimezone: true, mode: 'date' }).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    state: slaStateEnum('state').default('OPEN').notNull(),
    satisfiedAt: timestamp('satisfied_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_sla_timers_lead_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('lead_sla_timers_active_uidx')
      .on(table.clientOrganizationId, table.leadId)
      .where(sql`${table.state} in ('OPEN', 'WARNING', 'BREACHED')`),
    index('lead_sla_timers_due_idx').on(table.clientOrganizationId, table.state, table.dueAt),
  ],
);

export const slaEscalations = pgTable(
  'lead_sla_escalations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    timerId: uuid('timer_id').notNull(),
    level: integer('level').notNull(),
    state: varchar('state', { length: 32 }).default('OPEN').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_sla_escalations_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.timerId],
      foreignColumns: [slaTimers.id],
      name: 'lead_sla_timer_fk',
    }).onDelete('restrict'),
    uniqueIndex('lead_sla_escalations_level_uidx').on(table.timerId, table.level),
    index('lead_sla_escalations_queue_idx').on(
      table.clientOrganizationId,
      table.state,
      table.createdAt,
    ),
  ],
);

export const publicLeadForms = pgTable(
  'public_lead_forms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    clientFormKey: varchar('client_form_key', { length: 128 }).notNull(),
    branchId: uuid('branch_id').notNull(),
    assignmentQueueId: uuid('assignment_queue_id'),
    name: varchar('name', { length: 160 }).notNull(),
    active: boolean('active').default(true).notNull(),
    botProtectionEnabled: boolean('bot_protection_enabled').default(false).notNull(),
    rateLimitPerMinute: integer('rate_limit_per_minute').default(30).notNull(),
    consentNoticeVersion: varchar('consent_notice_version', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'public_lead_forms_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.assignmentQueueId],
      foreignColumns: [assignmentQueues.clientOrganizationId, assignmentQueues.id],
      name: 'public_lead_forms_queue_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('public_lead_forms_key_uidx').on(table.clientFormKey),
    unique('public_lead_forms_client_id_unique').on(table.clientOrganizationId, table.id),
    check('public_lead_forms_rate_limit_check', sql`${table.rateLimitPerMinute} between 1 and 600`),
  ],
);

export const leadIngestionReceipts = pgTable(
  'lead_ingestion_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    externalEventId: varchar('external_event_id', { length: 256 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    leadId: uuid('lead_id'),
    responseSnapshot: jsonb('response_snapshot').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'lead_ingestion_receipts_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'lead_ingestion_receipts_lead_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('lead_ingestion_receipts_external_uidx').on(
      table.clientOrganizationId,
      table.provider,
      table.externalEventId,
    ),
  ],
);
