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
import { contacts, leadOpportunities } from './leads.js';
import { branches, clientOrganizations, teams } from './organizations.js';
import { users } from './users.js';
import { inventoryUnits } from './inventory.js';

export const testRideStatusEnum = pgEnum('test_ride_status', [
  'REQUESTED',
  'BOOKED',
  'CUSTOMER_CONFIRMED',
  'EXECUTIVE_ASSIGNED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);
export const testRideBookingStatusEnum = pgEnum('test_ride_booking_status', [
  'HELD',
  'RELEASED',
  'COMPLETED',
]);
export const testRideTrackingStopReasonEnum = pgEnum('test_ride_tracking_stop_reason', [
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
  'MANUAL_STOP',
  'PERMISSION_REVOKED',
  'TIMEOUT',
]);

export const testRideAllocationLocks = pgTable(
  'test_ride_allocation_locks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    resourceType: varchar('resource_type', { length: 24 }).notNull(),
    resourceReference: varchar('resource_reference', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'test_ride_allocation_locks_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'test_ride_allocation_locks_branch_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('test_ride_allocation_locks_resource_uidx').on(
      table.clientOrganizationId,
      table.branchId,
      table.resourceType,
      table.resourceReference,
    ),
    check(
      'test_ride_allocation_locks_type_check',
      sql`${table.resourceType} in ('VEHICLE', 'EXECUTIVE')`,
    ),
  ],
);

export const testRideJobs = pgTable(
  'test_ride_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    leadId: uuid('lead_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    teamId: uuid('team_id'),
    vehicleModel: varchar('vehicle_model', { length: 240 }).notNull(),
    demoVehicleReference: varchar('demo_vehicle_reference', { length: 100 }).notNull(),
    inventoryUnitId: uuid('inventory_unit_id'),
    customerLocation: text('customer_location').notNull(),
    notes: text('notes'),
    scheduledStartAt: timestamp('scheduled_start_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: testRideStatusEnum('status').default('REQUESTED').notNull(),
    executiveUserId: uuid('executive_user_id'),
    executiveMembershipId: uuid('executive_membership_id'),
    assignedBy: uuid('assigned_by'),
    assignedAt: timestamp('assigned_at', { withTimezone: true, mode: 'date' }),
    confirmationChannel: varchar('confirmation_channel', { length: 32 }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    otpRequired: boolean('otp_required').default(false).notNull(),
    otpHash: varchar('otp_hash', { length: 64 }),
    startOdometerKm: integer('start_odometer_km'),
    endOdometerKm: integer('end_odometer_km'),
    startChecklist: jsonb('start_checklist').$type<Record<string, boolean>>(),
    completionChecklist: jsonb('completion_checklist').$type<Record<string, boolean>>(),
    completionEvidence: text('completion_evidence'),
    feedback: text('feedback'),
    cancellationReason: text('cancellation_reason'),
    noShowReason: text('no_show_reason'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),
    noShowAt: timestamp('no_show_at', { withTimezone: true, mode: 'date' }),
    trackingStartedAt: timestamp('tracking_started_at', { withTimezone: true, mode: 'date' }),
    trackingStoppedAt: timestamp('tracking_stopped_at', { withTimezone: true, mode: 'date' }),
    trackingExpiresAt: timestamp('tracking_expires_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').default(1).notNull(),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'test_ride_jobs_inventory_unit_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'test_ride_jobs_client_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'test_ride_jobs_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'test_ride_jobs_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'test_ride_jobs_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId, table.teamId],
      foreignColumns: [teams.clientOrganizationId, teams.branchId, teams.id],
      name: 'test_ride_jobs_team_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.executiveMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'test_ride_jobs_executive_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.executiveUserId, table.executiveMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'test_ride_jobs_executive_user_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [users.id],
      name: 'test_ride_jobs_assigned_by_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: 'test_ride_jobs_created_by_fk',
    }).onDelete('restrict'),
    unique('test_ride_jobs_client_id_unique').on(table.clientOrganizationId, table.id),
    index('test_ride_jobs_client_schedule_idx').on(
      table.clientOrganizationId,
      table.scheduledStartAt,
      table.status,
    ),
    index('test_ride_jobs_assignee_status_idx').on(
      table.clientOrganizationId,
      table.executiveMembershipId,
      table.status,
      table.scheduledStartAt,
    ),
    index('test_ride_jobs_active_tracking_idx').on(
      table.clientOrganizationId,
      table.status,
      table.trackingStoppedAt,
    ),
    check(
      'test_ride_jobs_schedule_check',
      sql`${table.scheduledEndAt} > ${table.scheduledStartAt}`,
    ),
    check('test_ride_jobs_version_check', sql`${table.version} >= 1`),
    check(
      'test_ride_jobs_odometer_check',
      sql`(${table.startOdometerKm} is null or ${table.startOdometerKm} >= 0) and (${table.endOdometerKm} is null or ${table.endOdometerKm} >= ${table.startOdometerKm})`,
    ),
    check(
      'test_ride_jobs_otp_check',
      sql`(${table.otpRequired} = false and ${table.otpHash} is null) or (${table.otpRequired} = true and ${table.otpHash} is not null)`,
    ),
  ],
);

export const demoVehicleBookings = pgTable(
  'test_ride_demo_vehicle_bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    testRideJobId: uuid('test_ride_job_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    demoVehicleReference: varchar('demo_vehicle_reference', { length: 100 }).notNull(),
    inventoryUnitId: uuid('inventory_unit_id'),
    scheduledStartAt: timestamp('scheduled_start_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: testRideBookingStatusEnum('status').default('HELD').notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'test_ride_vehicle_bookings_inventory_unit_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.testRideJobId],
      foreignColumns: [testRideJobs.clientOrganizationId, testRideJobs.id],
      name: 'test_ride_vehicle_bookings_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'test_ride_vehicle_bookings_branch_tenant_fk',
    }).onDelete('restrict'),
    unique('test_ride_vehicle_bookings_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('test_ride_vehicle_bookings_active_job_uidx')
      .on(table.clientOrganizationId, table.testRideJobId)
      .where(sql`${table.status} = 'HELD'`),
    index('test_ride_vehicle_bookings_overlap_idx').on(
      table.clientOrganizationId,
      table.branchId,
      table.demoVehicleReference,
      table.status,
      table.scheduledStartAt,
      table.scheduledEndAt,
    ),
    check(
      'test_ride_vehicle_bookings_schedule_check',
      sql`${table.scheduledEndAt} > ${table.scheduledStartAt}`,
    ),
  ],
);

export const testRideEvents = pgTable(
  'test_ride_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    testRideJobId: uuid('test_ride_job_id').notNull(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    fromStatus: testRideStatusEnum('from_status'),
    toStatus: testRideStatusEnum('to_status'),
    actorUserId: uuid('actor_user_id'),
    actorMembershipId: uuid('actor_membership_id'),
    reason: text('reason'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.testRideJobId],
      foreignColumns: [testRideJobs.clientOrganizationId, testRideJobs.id],
      name: 'test_ride_events_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'test_ride_events_actor_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.actorUserId, table.actorMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'test_ride_events_actor_user_membership_fk',
    }).onDelete('restrict'),
    unique('test_ride_events_client_id_unique').on(table.clientOrganizationId, table.id),
    index('test_ride_events_timeline_idx').on(
      table.clientOrganizationId,
      table.testRideJobId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const testRideLocationSessions = pgTable(
  'test_ride_location_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    testRideJobId: uuid('test_ride_job_id').notNull(),
    executiveUserId: uuid('executive_user_id').notNull(),
    executiveMembershipId: uuid('executive_membership_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    stoppedAt: timestamp('stopped_at', { withTimezone: true, mode: 'date' }),
    stopReason: testRideTrackingStopReasonEnum('stop_reason'),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.testRideJobId],
      foreignColumns: [testRideJobs.clientOrganizationId, testRideJobs.id],
      name: 'test_ride_location_sessions_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.executiveMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'test_ride_location_sessions_member_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.executiveUserId, table.executiveMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'test_ride_location_sessions_user_member_fk',
    }).onDelete('restrict'),
    unique('test_ride_location_sessions_client_id_unique').on(table.clientOrganizationId, table.id),
    unique('test_ride_location_sessions_sample_identity_unique').on(
      table.clientOrganizationId,
      table.id,
      table.testRideJobId,
      table.executiveUserId,
    ),
    uniqueIndex('test_ride_location_sessions_active_job_uidx')
      .on(table.clientOrganizationId, table.testRideJobId)
      .where(sql`${table.stoppedAt} is null`),
    index('test_ride_location_sessions_active_user_idx').on(
      table.clientOrganizationId,
      table.executiveMembershipId,
      table.stoppedAt,
    ),
    check('test_ride_location_sessions_window_check', sql`${table.expiresAt} > ${table.startedAt}`),
  ],
);

export const testRideLocationSamples = pgTable(
  'test_ride_location_samples',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    testRideJobId: uuid('test_ride_job_id').notNull(),
    locationSessionId: uuid('location_session_id').notNull(),
    executiveUserId: uuid('executive_user_id').notNull(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    accuracyMeters: doublePrecision('accuracy_meters').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.testRideJobId],
      foreignColumns: [testRideJobs.clientOrganizationId, testRideJobs.id],
      name: 'test_ride_locations_job_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.locationSessionId],
      foreignColumns: [testRideLocationSessions.clientOrganizationId, testRideLocationSessions.id],
      name: 'test_ride_locations_session_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [
        table.clientOrganizationId,
        table.locationSessionId,
        table.testRideJobId,
        table.executiveUserId,
      ],
      foreignColumns: [
        testRideLocationSessions.clientOrganizationId,
        testRideLocationSessions.id,
        testRideLocationSessions.testRideJobId,
        testRideLocationSessions.executiveUserId,
      ],
      name: 'test_ride_locations_session_identity_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.executiveUserId],
      foreignColumns: [users.id],
      name: 'test_ride_locations_user_fk',
    }).onDelete('restrict'),
    unique('test_ride_locations_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('test_ride_locations_idempotency_uidx').on(
      table.clientOrganizationId,
      table.idempotencyKey,
    ),
    index('test_ride_locations_job_timeline_idx').on(
      table.clientOrganizationId,
      table.testRideJobId,
      table.capturedAt,
      table.id,
    ),
    check('test_ride_locations_latitude_check', sql`${table.latitude} between -90 and 90`),
    check('test_ride_locations_longitude_check', sql`${table.longitude} between -180 and 180`),
    check('test_ride_locations_accuracy_check', sql`${table.accuracyMeters} > 0`),
    check('test_ride_locations_retention_check', sql`${table.expiresAt} > ${table.capturedAt}`),
  ],
);

export const testRideCommandReceipts = pgTable(
  'test_ride_command_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    testRideJobId: uuid('test_ride_job_id'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    commandType: varchar('command_type', { length: 64 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    responseSnapshot: jsonb('response_snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.testRideJobId],
      foreignColumns: [testRideJobs.clientOrganizationId, testRideJobs.id],
      name: 'test_ride_command_receipts_job_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('test_ride_command_receipts_key_uidx').on(
      table.clientOrganizationId,
      table.idempotencyKey,
    ),
    index('test_ride_command_receipts_job_idx').on(
      table.clientOrganizationId,
      table.testRideJobId,
      table.createdAt,
    ),
  ],
);
