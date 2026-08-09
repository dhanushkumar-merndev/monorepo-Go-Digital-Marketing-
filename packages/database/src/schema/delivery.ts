import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
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
import { bookings } from './commercial.js';
import { inventoryUnits } from './inventory.js';
import { contacts, leadOpportunities } from './leads.js';
import { branches, clientOrganizations } from './organizations.js';

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'VEHICLE_ALLOCATED',
  'VEHICLE_PREPARATION',
  'READY_FOR_DELIVERY',
  'DELIVERY_SCHEDULED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELAYED',
  'FAILED',
  'RESCHEDULED',
  'CANCELLED',
]);
export const deliveryChecklistCodeEnum = pgEnum('delivery_checklist_code', [
  'ACCESSORIES',
  'PDI',
  'DOCUMENTS',
  'FUEL_OR_CHARGE',
  'BATTERY',
  'EXTERIOR_CONDITION',
  'INTERIOR_CONDITION',
]);
export const deliveryProofTypeEnum = pgEnum('delivery_proof_type', [
  'OTP',
  'SIGNATURE',
  'PHOTO',
  'RECEIVED_BY',
]);
export const deliveryProofStatusEnum = pgEnum('delivery_proof_status', [
  'PENDING_UPLOAD',
  'PENDING_SCAN',
  'VERIFIED',
  'REJECTED',
]);
export const deliveryRescheduleStatusEnum = pgEnum('delivery_reschedule_status', [
  'NONE',
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

export const deliverySettings = pgTable(
  'delivery_settings',
  {
    clientOrganizationId: uuid('client_organization_id').primaryKey(),
    requiredChecklistCodes: jsonb('required_checklist_codes')
      .$type<string[]>()
      .default([
        'ACCESSORIES',
        'PDI',
        'DOCUMENTS',
        'FUEL_OR_CHARGE',
        'BATTERY',
        'EXTERIOR_CONDITION',
        'INTERIOR_CONDITION',
      ])
      .notNull(),
    requiredProofTypes: jsonb('required_proof_types')
      .$type<string[]>()
      .default(['RECEIVED_BY'])
      .notNull(),
    activeTimeoutMinutes: integer('active_timeout_minutes').default(480).notNull(),
    locationRetentionDays: integer('location_retention_days').default(30).notNull(),
    locationStaleSeconds: integer('location_stale_seconds').default(180).notNull(),
    version: integer('version').default(1).notNull(),
    updatedByMembershipId: uuid('updated_by_membership_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'delivery_settings_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.updatedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_settings_actor_tenant_fk',
    }).onDelete('restrict'),
    check(
      'delivery_settings_bounds_check',
      sql`${table.activeTimeoutMinutes} between 30 and 1440 and ${table.locationRetentionDays} between 1 and 365 and ${table.locationStaleSeconds} between 60 and 1800 and ${table.version} >= 1`,
    ),
  ],
);

export const deliveryJobs = pgTable(
  'delivery_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    inventoryUnitId: uuid('inventory_unit_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    assignedMembershipId: uuid('assigned_membership_id'),
    assignedUserId: uuid('assigned_user_id'),
    status: deliveryStatusEnum('status').default('VEHICLE_ALLOCATED').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true, mode: 'date' }).notNull(),
    destinationAddress: text('destination_address').notNull(),
    destinationLatitude: doublePrecision('destination_latitude'),
    destinationLongitude: doublePrecision('destination_longitude'),
    trackingActive: boolean('tracking_active').default(false).notNull(),
    trackingStartedAt: timestamp('tracking_started_at', { withTimezone: true, mode: 'date' }),
    trackingExpiresAt: timestamp('tracking_expires_at', { withTimezone: true, mode: 'date' }),
    lastLocationAt: timestamp('last_location_at', { withTimezone: true, mode: 'date' }),
    rescheduleStatus: deliveryRescheduleStatusEnum('reschedule_status').default('NONE').notNull(),
    requestedScheduleAt: timestamp('requested_schedule_at', {
      withTimezone: true,
      mode: 'date',
    }),
    exceptionReason: text('exception_reason'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').default(1).notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'delivery_jobs_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'delivery_jobs_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'delivery_jobs_inventory_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'delivery_jobs_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'delivery_jobs_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.assignedMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_jobs_assignee_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedUserId, table.assignedMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'delivery_jobs_assignee_user_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_jobs_creator_tenant_fk',
    }).onDelete('restrict'),
    unique('delivery_jobs_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('delivery_jobs_booking_uidx').on(table.clientOrganizationId, table.bookingId),
    index('delivery_jobs_branch_status_schedule_idx').on(
      table.clientOrganizationId,
      table.branchId,
      table.status,
      table.scheduledFor,
    ),
    index('delivery_jobs_assignee_schedule_idx').on(
      table.clientOrganizationId,
      table.assignedMembershipId,
      table.scheduledFor,
    ),
    check(
      'delivery_jobs_destination_latitude_check',
      sql`${table.destinationLatitude} is null or ${table.destinationLatitude} between -90 and 90`,
    ),
    check(
      'delivery_jobs_destination_longitude_check',
      sql`${table.destinationLongitude} is null or ${table.destinationLongitude} between -180 and 180`,
    ),
    check('delivery_jobs_version_check', sql`${table.version} >= 1`),
    check(
      'delivery_jobs_tracking_window_check',
      sql`(${table.trackingStartedAt} is null and ${table.trackingExpiresAt} is null) or (${table.trackingStartedAt} is not null and ${table.trackingExpiresAt} > ${table.trackingStartedAt})`,
    ),
  ],
);

export const deliveryStatusEvents = pgTable(
  'delivery_status_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    deliveryJobId: uuid('delivery_job_id').notNull(),
    fromStatus: deliveryStatusEnum('from_status'),
    toStatus: deliveryStatusEnum('to_status').notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    reason: text('reason'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    actorMembershipId: uuid('actor_membership_id'),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryJobId],
      foreignColumns: [deliveryJobs.clientOrganizationId, deliveryJobs.id],
      name: 'delivery_status_events_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_status_events_actor_tenant_fk',
    }).onDelete('restrict'),
    index('delivery_status_events_timeline_idx').on(
      table.clientOrganizationId,
      table.deliveryJobId,
      table.createdAt,
    ),
  ],
);

export const deliveryChecklistItems = pgTable(
  'delivery_checklist_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    deliveryJobId: uuid('delivery_job_id').notNull(),
    code: deliveryChecklistCodeEnum('code').notNull(),
    required: boolean('required').default(true).notNull(),
    checked: boolean('checked').default(false).notNull(),
    note: text('note'),
    checkedByMembershipId: uuid('checked_by_membership_id'),
    checkedAt: timestamp('checked_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryJobId],
      foreignColumns: [deliveryJobs.clientOrganizationId, deliveryJobs.id],
      name: 'delivery_checklist_items_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.checkedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_checklist_items_actor_tenant_fk',
    }).onDelete('restrict'),
    unique('delivery_checklist_items_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('delivery_checklist_items_code_uidx').on(
      table.clientOrganizationId,
      table.deliveryJobId,
      table.code,
    ),
    check('delivery_checklist_items_version_check', sql`${table.version} >= 1`),
  ],
);

export const deliveryChecklistEvents = pgTable(
  'delivery_checklist_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    deliveryJobId: uuid('delivery_job_id').notNull(),
    checklistItemId: uuid('checklist_item_id').notNull(),
    checked: boolean('checked').notNull(),
    note: text('note'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryJobId],
      foreignColumns: [deliveryJobs.clientOrganizationId, deliveryJobs.id],
      name: 'delivery_checklist_events_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.checklistItemId],
      foreignColumns: [deliveryChecklistItems.clientOrganizationId, deliveryChecklistItems.id],
      name: 'delivery_checklist_events_item_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_checklist_events_actor_tenant_fk',
    }).onDelete('restrict'),
    index('delivery_checklist_events_timeline_idx').on(
      table.clientOrganizationId,
      table.deliveryJobId,
      table.createdAt,
    ),
  ],
);

export const deliveryProofs = pgTable(
  'delivery_proofs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    deliveryJobId: uuid('delivery_job_id').notNull(),
    proofType: deliveryProofTypeEnum('proof_type').notNull(),
    status: deliveryProofStatusEnum('status').notNull(),
    objectKey: text('object_key'),
    fileName: varchar('file_name', { length: 240 }),
    contentType: varchar('content_type', { length: 120 }),
    contentLength: integer('content_length'),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    scannerStatus: varchar('scanner_status', { length: 40 }),
    receivedByName: varchar('received_by_name', { length: 160 }),
    valueHash: varchar('value_hash', { length: 64 }),
    uploadedByMembershipId: uuid('uploaded_by_membership_id'),
    reviewedByMembershipId: uuid('reviewed_by_membership_id'),
    reviewReason: text('review_reason'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryJobId],
      foreignColumns: [deliveryJobs.clientOrganizationId, deliveryJobs.id],
      name: 'delivery_proofs_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.uploadedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_proofs_uploader_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.reviewedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_proofs_reviewer_tenant_fk',
    }).onDelete('restrict'),
    unique('delivery_proofs_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('delivery_proofs_verified_type_uidx')
      .on(table.clientOrganizationId, table.deliveryJobId, table.proofType)
      .where(sql`${table.status} = 'VERIFIED'`),
    uniqueIndex('delivery_proofs_object_key_uidx')
      .on(table.objectKey)
      .where(sql`${table.objectKey} is not null`),
    index('delivery_proofs_job_created_idx').on(
      table.clientOrganizationId,
      table.deliveryJobId,
      table.createdAt,
    ),
    check(
      'delivery_proofs_object_metadata_check',
      sql`(${table.proofType} in ('SIGNATURE', 'PHOTO') and ${table.objectKey} is not null and ${table.contentLength} > 0 and ${table.checksumSha256} is not null) or (${table.proofType} = 'RECEIVED_BY' and ${table.receivedByName} is not null) or (${table.proofType} = 'OTP' and ${table.valueHash} is not null)`,
    ),
  ],
);

export const deliveryProofDownloadEvents = pgTable(
  'delivery_proof_download_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    deliveryJobId: uuid('delivery_job_id').notNull(),
    deliveryProofId: uuid('delivery_proof_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    purpose: text('purpose').notNull(),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryJobId],
      foreignColumns: [deliveryJobs.clientOrganizationId, deliveryJobs.id],
      name: 'delivery_proof_downloads_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryProofId],
      foreignColumns: [deliveryProofs.clientOrganizationId, deliveryProofs.id],
      name: 'delivery_proof_downloads_proof_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_proof_downloads_actor_tenant_fk',
    }).onDelete('restrict'),
    index('delivery_proof_downloads_timeline_idx').on(
      table.clientOrganizationId,
      table.deliveryJobId,
      table.createdAt,
    ),
  ],
);

export const deliveryOtpChallenges = pgTable(
  'delivery_otp_challenges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    deliveryJobId: uuid('delivery_job_id').notNull(),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryJobId],
      foreignColumns: [deliveryJobs.clientOrganizationId, deliveryJobs.id],
      name: 'delivery_otp_challenges_job_tenant_fk',
    }).onDelete('restrict'),
    index('delivery_otp_challenges_active_idx').on(
      table.clientOrganizationId,
      table.deliveryJobId,
      table.expiresAt,
    ),
    check('delivery_otp_challenges_attempts_check', sql`${table.attempts} between 0 and 5`),
  ],
);

export const deliveryLocationSessions = pgTable(
  'delivery_location_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    deliveryJobId: uuid('delivery_job_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    userId: uuid('user_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    stoppedAt: timestamp('stopped_at', { withTimezone: true, mode: 'date' }),
    stopReason: varchar('stop_reason', { length: 80 }),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryJobId],
      foreignColumns: [deliveryJobs.clientOrganizationId, deliveryJobs.id],
      name: 'delivery_location_sessions_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.membershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'delivery_location_sessions_member_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId, table.membershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'delivery_location_sessions_user_member_fk',
    }).onDelete('restrict'),
    unique('delivery_location_sessions_client_id_unique').on(table.clientOrganizationId, table.id),
    unique('delivery_location_sessions_job_identity_unique').on(
      table.clientOrganizationId,
      table.id,
      table.deliveryJobId,
    ),
    uniqueIndex('delivery_location_sessions_active_job_uidx')
      .on(table.clientOrganizationId, table.deliveryJobId)
      .where(sql`${table.stoppedAt} is null`),
    index('delivery_location_sessions_active_user_idx').on(
      table.clientOrganizationId,
      table.membershipId,
      table.stoppedAt,
    ),
    check('delivery_location_sessions_window_check', sql`${table.expiresAt} > ${table.startedAt}`),
  ],
);

export const deliveryLocationSamples = pgTable(
  'delivery_location_samples',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    deliveryJobId: uuid('delivery_job_id').notNull(),
    locationSessionId: uuid('location_session_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    accuracyMeters: doublePrecision('accuracy_meters').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryJobId],
      foreignColumns: [deliveryJobs.clientOrganizationId, deliveryJobs.id],
      name: 'delivery_locations_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.locationSessionId, table.deliveryJobId],
      foreignColumns: [
        deliveryLocationSessions.clientOrganizationId,
        deliveryLocationSessions.id,
        deliveryLocationSessions.deliveryJobId,
      ],
      name: 'delivery_locations_session_identity_fk',
    }).onDelete('restrict'),
    uniqueIndex('delivery_locations_idempotency_uidx').on(
      table.clientOrganizationId,
      table.idempotencyKey,
    ),
    index('delivery_locations_job_timeline_idx').on(
      table.clientOrganizationId,
      table.deliveryJobId,
      table.capturedAt,
    ),
    index('delivery_locations_expiry_idx').on(table.expiresAt),
    check('delivery_locations_latitude_check', sql`${table.latitude} between -90 and 90`),
    check('delivery_locations_longitude_check', sql`${table.longitude} between -180 and 180`),
    check('delivery_locations_accuracy_check', sql`${table.accuracyMeters} > 0`),
    check('delivery_locations_retention_check', sql`${table.expiresAt} > ${table.capturedAt}`),
  ],
);

export const deliveryCommandReceipts = pgTable(
  'delivery_command_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    commandType: varchar('command_type', { length: 100 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    responseSnapshot: jsonb('response_snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'delivery_command_receipts_client_fk',
    }).onDelete('restrict'),
    uniqueIndex('delivery_command_receipts_key_uidx').on(
      table.clientOrganizationId,
      table.idempotencyKey,
    ),
  ],
);
