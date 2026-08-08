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
import { assignmentQueues, contacts, leadOpportunities } from './leads.js';
import { branches, clientOrganizations, teams } from './organizations.js';
import { users } from './users.js';

export const messagingChannelEnum = pgEnum('messaging_channel', ['WHATSAPP', 'EMAIL', 'SMS']);
export const messagingConnectionStatusEnum = pgEnum('messaging_connection_status', [
  'PENDING_APPROVAL',
  'ACTIVE',
  'DEGRADED',
  'DISABLED',
]);
export const conversationStatusEnum = pgEnum('conversation_status', ['OPEN', 'PENDING', 'CLOSED']);
export const conversationParticipantRoleEnum = pgEnum('conversation_participant_role', [
  'CUSTOMER',
  'AGENT',
  'QUEUE',
]);
export const messageDirectionEnum = pgEnum('message_direction', [
  'INBOUND',
  'OUTBOUND',
  'INTERNAL',
]);
export const messageContentTypeEnum = pgEnum('message_content_type', [
  'TEXT',
  'TEMPLATE',
  'MEDIA',
  'NOTE',
]);
export const messageDeliveryStatusEnum = pgEnum('message_delivery_status', [
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'RECEIVED',
  'FAILED',
]);
export const messageMediaAvailabilityEnum = pgEnum('message_media_availability', [
  'PENDING',
  'AVAILABLE',
  'UNAVAILABLE',
  'EXPIRED',
]);
export const messageTemplateCategoryEnum = pgEnum('message_template_category', [
  'MARKETING',
  'UTILITY',
  'AUTHENTICATION',
]);
export const messageTemplateStatusEnum = pgEnum('message_template_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAUSED',
  'DISABLED',
]);
export const messageOutboxStatusEnum = pgEnum('message_outbox_status', [
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED',
  'DEAD_LETTER',
]);
export const messagingOptInStatusEnum = pgEnum('messaging_opt_in_status', [
  'GRANTED',
  'DENIED',
  'WITHDRAWN',
]);
export const messagingSuppressionScopeEnum = pgEnum('messaging_suppression_scope', [
  'MARKETING',
  'ALL',
]);

/** Tenant connection metadata. The credential bundle is AES-GCM ciphertext and is never returned. */
export const messagingProviderConnections = pgTable(
  'messaging_provider_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    defaultAssignmentQueueId: uuid('default_assignment_queue_id'),
    provider: varchar('provider', { length: 64 }).notNull(),
    channel: messagingChannelEnum('channel').notNull(),
    connectionKey: varchar('connection_key', { length: 128 }).notNull(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    status: messagingConnectionStatusEnum('status').default('PENDING_APPROVAL').notNull(),
    wabaId: varchar('waba_id', { length: 128 }),
    phoneNumberId: varchar('phone_number_id', { length: 128 }),
    businessPhoneE164: varchar('business_phone_e164', { length: 32 }),
    credentialCiphertext: text('credential_ciphertext'),
    credentialIv: varchar('credential_iv', { length: 64 }),
    credentialAuthTag: varchar('credential_auth_tag', { length: 64 }),
    credentialKeyId: varchar('credential_key_id', { length: 64 }),
    embeddedOnboardingState: jsonb('embedded_onboarding_state')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),
    templateSyncStatus: varchar('template_sync_status', { length: 32 })
      .default('NOT_SYNCED')
      .notNull(),
    templateSyncedAt: timestamp('template_synced_at', { withTimezone: true, mode: 'date' }),
    qualityRating: varchar('quality_rating', { length: 32 }),
    messagingLimit: varchar('messaging_limit', { length: 64 }),
    webhookState: varchar('webhook_state', { length: 32 }).default('NOT_VERIFIED').notNull(),
    lastWebhookAt: timestamp('last_webhook_at', { withTimezone: true, mode: 'date' }),
    lastHealthAt: timestamp('last_health_at', { withTimezone: true, mode: 'date' }),
    lastHealthStatus: varchar('last_health_status', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'messaging_connections_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'messaging_connections_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.defaultAssignmentQueueId],
      foreignColumns: [assignmentQueues.clientOrganizationId, assignmentQueues.id],
      name: 'messaging_connections_queue_tenant_fk',
    }).onDelete('restrict'),
    unique('messaging_connections_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('messaging_connections_key_uidx').on(table.connectionKey),
    uniqueIndex('messaging_connections_phone_uidx')
      .on(table.clientOrganizationId, table.provider, table.phoneNumberId)
      .where(sql`${table.phoneNumberId} is not null`),
    index('messaging_connections_client_status_idx').on(
      table.clientOrganizationId,
      table.channel,
      table.status,
    ),
    check(
      'messaging_connections_credentials_check',
      sql`(${table.credentialCiphertext} is null and ${table.credentialIv} is null and ${table.credentialAuthTag} is null and ${table.credentialKeyId} is null) or (${table.credentialCiphertext} is not null and ${table.credentialIv} is not null and ${table.credentialAuthTag} is not null and ${table.credentialKeyId} is not null)`,
    ),
  ],
);

export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    connectionId: uuid('connection_id').notNull(),
    externalTemplateId: varchar('external_template_id', { length: 256 }),
    name: varchar('name', { length: 512 }).notNull(),
    language: varchar('language', { length: 32 }).notNull(),
    category: messageTemplateCategoryEnum('category').notNull(),
    status: messageTemplateStatusEnum('status').default('PENDING').notNull(),
    bodyText: text('body_text').notNull(),
    components: jsonb('components').$type<Record<string, unknown>[]>().default([]).notNull(),
    providerMetadata: jsonb('provider_metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.connectionId],
      foreignColumns: [
        messagingProviderConnections.clientOrganizationId,
        messagingProviderConnections.id,
      ],
      name: 'message_templates_connection_tenant_fk',
    }).onDelete('restrict'),
    unique('message_templates_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('message_templates_name_language_uidx').on(
      table.clientOrganizationId,
      table.connectionId,
      table.name,
      table.language,
    ),
    index('message_templates_catalog_idx').on(
      table.clientOrganizationId,
      table.status,
      table.category,
      table.name,
    ),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    connectionId: uuid('connection_id').notNull(),
    channel: messagingChannelEnum('channel').notNull(),
    contactId: uuid('contact_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    teamId: uuid('team_id'),
    conversationOwnerId: uuid('conversation_owner_id'),
    conversationOwnerMembershipId: uuid('conversation_owner_membership_id'),
    remoteAddress: varchar('remote_address', { length: 320 }).notNull(),
    subject: varchar('subject', { length: 240 }),
    status: conversationStatusEnum('status').default('OPEN').notNull(),
    unreadCount: integer('unread_count').default(0).notNull(),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true, mode: 'date' }),
    lastOutboundAt: timestamp('last_outbound_at', { withTimezone: true, mode: 'date' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.connectionId],
      foreignColumns: [
        messagingProviderConnections.clientOrganizationId,
        messagingProviderConnections.id,
      ],
      name: 'conversations_connection_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'conversations_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'conversations_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'conversations_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId, table.teamId],
      foreignColumns: [teams.clientOrganizationId, teams.branchId, teams.id],
      name: 'conversations_team_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.conversationOwnerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'conversations_owner_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.conversationOwnerId, table.conversationOwnerMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'conversations_owner_user_membership_fk',
    }).onDelete('restrict'),
    unique('conversations_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('conversations_active_remote_uidx')
      .on(table.clientOrganizationId, table.connectionId, table.remoteAddress)
      .where(sql`${table.status} <> 'CLOSED'`),
    index('conversations_inbox_idx').on(
      table.clientOrganizationId,
      table.status,
      table.conversationOwnerId,
      table.lastMessageAt,
    ),
    index('conversations_lead_idx').on(
      table.clientOrganizationId,
      table.leadId,
      table.lastMessageAt,
    ),
    check('conversations_unread_check', sql`${table.unreadCount} >= 0`),
    check('conversations_version_check', sql`${table.version} >= 1`),
  ],
);

export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    role: conversationParticipantRoleEnum('role').notNull(),
    contactId: uuid('contact_id'),
    membershipId: uuid('membership_id'),
    userId: uuid('user_id'),
    teamId: uuid('team_id'),
    address: varchar('address', { length: 320 }),
    displayName: varchar('display_name', { length: 160 }),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.conversationId],
      foreignColumns: [conversations.clientOrganizationId, conversations.id],
      name: 'conversation_participants_conversation_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'conversation_participants_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.membershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'conversation_participants_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'conversation_participants_user_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.teamId],
      foreignColumns: [teams.clientOrganizationId, teams.id],
      name: 'conversation_participants_team_tenant_fk',
    }).onDelete('restrict'),
    index('conversation_participants_conversation_idx').on(
      table.clientOrganizationId,
      table.conversationId,
      table.active,
    ),
    check(
      'conversation_participants_identity_check',
      sql`(${table.role} = 'CUSTOMER' and ${table.contactId} is not null) or (${table.role} = 'AGENT' and ${table.membershipId} is not null and ${table.userId} is not null) or (${table.role} = 'QUEUE' and ${table.teamId} is not null)`,
    ),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    direction: messageDirectionEnum('direction').notNull(),
    contentType: messageContentTypeEnum('content_type').notNull(),
    status: messageDeliveryStatusEnum('status').notNull(),
    bodyText: text('body_text'),
    templateId: uuid('template_id'),
    templateVariables: jsonb('template_variables')
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    providerMessageId: varchar('provider_message_id', { length: 256 }),
    clientIdempotencyKey: varchar('client_idempotency_key', { length: 256 }),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }),
    replyToMessageId: uuid('reply_to_message_id'),
    senderUserId: uuid('sender_user_id'),
    senderMembershipId: uuid('sender_membership_id'),
    providerOccurredAt: timestamp('provider_occurred_at', { withTimezone: true, mode: 'date' }),
    providerSequence: varchar('provider_sequence', { length: 128 }),
    referralMetadata: jsonb('referral_metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    providerMetadata: jsonb('provider_metadata')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.conversationId],
      foreignColumns: [conversations.clientOrganizationId, conversations.id],
      name: 'messages_conversation_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.templateId],
      foreignColumns: [messageTemplates.clientOrganizationId, messageTemplates.id],
      name: 'messages_template_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.senderMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'messages_sender_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.senderUserId],
      foreignColumns: [users.id],
      name: 'messages_sender_user_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.replyToMessageId],
      foreignColumns: [table.clientOrganizationId, table.id],
      name: 'messages_reply_to_tenant_fk',
    }).onDelete('restrict'),
    unique('messages_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('messages_provider_id_uidx')
      .on(table.clientOrganizationId, table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    uniqueIndex('messages_idempotency_uidx')
      .on(table.clientOrganizationId, table.clientIdempotencyKey)
      .where(sql`${table.clientIdempotencyKey} is not null`),
    index('messages_timeline_order_idx').on(
      table.clientOrganizationId,
      table.conversationId,
      table.providerOccurredAt,
      table.providerSequence,
      table.receivedAt,
      table.id,
    ),
    check(
      'messages_content_check',
      sql`(${table.contentType} in ('TEXT', 'NOTE') and ${table.bodyText} is not null) or (${table.contentType} = 'TEMPLATE' and ${table.templateId} is not null) or ${table.contentType} = 'MEDIA'`,
    ),
    check(
      'messages_sender_check',
      sql`${table.direction} = 'INBOUND' or (${table.senderUserId} is not null and ${table.senderMembershipId} is not null)`,
    ),
  ],
);

export const messageMedia = pgTable(
  'message_media',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    messageId: uuid('message_id').notNull(),
    providerMediaId: varchar('provider_media_id', { length: 256 }),
    objectKey: varchar('object_key', { length: 1024 }),
    originalFilename: varchar('original_filename', { length: 180 }),
    mimeType: varchar('mime_type', { length: 128 }).notNull(),
    sizeBytes: integer('size_bytes'),
    checksumSha256: varchar('checksum_sha256', { length: 128 }),
    availability: messageMediaAvailabilityEnum('availability').default('PENDING').notNull(),
    retentionExpiresAt: timestamp('retention_expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.messageId],
      foreignColumns: [messages.clientOrganizationId, messages.id],
      name: 'message_media_message_tenant_fk',
    }).onDelete('restrict'),
    unique('message_media_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('message_media_provider_uidx')
      .on(table.clientOrganizationId, table.providerMediaId)
      .where(sql`${table.providerMediaId} is not null`),
    index('message_media_message_idx').on(table.clientOrganizationId, table.messageId),
    check('message_media_size_check', sql`${table.sizeBytes} is null or ${table.sizeBytes} >= 0`),
  ],
);

/** Append-only status evidence. Current message status is a projection of this history. */
export const messageStatusHistory = pgTable(
  'message_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    messageId: uuid('message_id').notNull(),
    status: messageDeliveryStatusEnum('status').notNull(),
    providerEventId: varchar('provider_event_id', { length: 256 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull(),
    errorCode: varchar('error_code', { length: 100 }),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.messageId],
      foreignColumns: [messages.clientOrganizationId, messages.id],
      name: 'message_status_history_message_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('message_status_provider_event_uidx')
      .on(table.clientOrganizationId, table.providerEventId)
      .where(sql`${table.providerEventId} is not null`),
    index('message_status_history_order_idx').on(
      table.clientOrganizationId,
      table.messageId,
      table.occurredAt,
      table.id,
    ),
  ],
);

export const conversationAssignments = pgTable(
  'conversation_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    fromOwnerMembershipId: uuid('from_owner_membership_id'),
    toOwnerMembershipId: uuid('to_owner_membership_id'),
    fromTeamId: uuid('from_team_id'),
    toTeamId: uuid('to_team_id'),
    reason: text('reason').notNull(),
    assignedByUserId: uuid('assigned_by_user_id').notNull(),
    assignedByMembershipId: uuid('assigned_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.conversationId],
      foreignColumns: [conversations.clientOrganizationId, conversations.id],
      name: 'conversation_assignments_conversation_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.toOwnerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'conversation_assignments_to_owner_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.fromOwnerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'conversation_assignments_from_owner_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.fromTeamId],
      foreignColumns: [teams.clientOrganizationId, teams.id],
      name: 'conversation_assignments_from_team_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.toTeamId],
      foreignColumns: [teams.clientOrganizationId, teams.id],
      name: 'conversation_assignments_to_team_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.assignedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'conversation_assignments_actor_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedByUserId],
      foreignColumns: [users.id],
      name: 'conversation_assignments_actor_user_fk',
    }).onDelete('restrict'),
    index('conversation_assignments_conversation_idx').on(
      table.clientOrganizationId,
      table.conversationId,
      table.createdAt,
    ),
  ],
);

/** PostgreSQL source of truth for delivery work; Redis/BullMQ may accelerate but cannot replace it. */
export const messageOutboundOutbox = pgTable(
  'message_outbound_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    messageId: uuid('message_id').notNull(),
    status: messageOutboxStatusEnum('status').default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true, mode: 'date' }),
    lockedBy: varchar('locked_by', { length: 128 }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    lastErrorCode: varchar('last_error_code', { length: 100 }),
    lastErrorMessage: text('last_error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.messageId],
      foreignColumns: [messages.clientOrganizationId, messages.id],
      name: 'message_outbox_message_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('message_outbox_message_uidx').on(table.clientOrganizationId, table.messageId),
    index('message_outbox_pending_idx').on(table.status, table.availableAt),
    check('message_outbox_attempts_check', sql`${table.attempts} >= 0`),
  ],
);

export const messagingOptInRecords = pgTable(
  'messaging_opt_in_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    channel: messagingChannelEnum('channel').notNull(),
    category: messageTemplateCategoryEnum('category'),
    status: messagingOptInStatusEnum('status').notNull(),
    source: varchar('source', { length: 64 }).notNull(),
    noticeVersion: varchar('notice_version', { length: 64 }).notNull(),
    evidence: text('evidence').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'messaging_opt_in_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [users.id],
      name: 'messaging_opt_in_created_by_fk',
    }).onDelete('restrict'),
    unique('messaging_opt_in_client_id_unique').on(table.clientOrganizationId, table.id),
    index('messaging_opt_in_lookup_idx').on(
      table.clientOrganizationId,
      table.contactId,
      table.channel,
      table.category,
      table.capturedAt,
    ),
  ],
);

export const messagingSuppressions = pgTable(
  'messaging_suppressions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    channel: messagingChannelEnum('channel').notNull(),
    scope: messagingSuppressionScopeEnum('scope').notNull(),
    reason: text('reason').notNull(),
    active: boolean('active').default(true).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'messaging_suppressions_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [users.id],
      name: 'messaging_suppressions_created_by_fk',
    }).onDelete('restrict'),
    unique('messaging_suppressions_client_id_unique').on(table.clientOrganizationId, table.id),
    index('messaging_suppressions_active_idx').on(
      table.clientOrganizationId,
      table.contactId,
      table.channel,
      table.active,
      table.startsAt,
      table.endsAt,
    ),
  ],
);
