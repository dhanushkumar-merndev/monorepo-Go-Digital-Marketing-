import { sql } from 'drizzle-orm';
import {
  check,
  date,
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
import { deliveryJobs } from './delivery.js';
import { inventoryUnits } from './inventory.js';
import { contacts } from './leads.js';
import { branches, clientOrganizations } from './organizations.js';

export const registrationStatusEnum = pgEnum('registration_status', [
  'DOCUMENTS_READY',
  'REGISTRATION_STARTED',
  'RTO_SUBMITTED',
  'NUMBER_ALLOTTED',
  'RC_PENDING',
  'RC_RECEIVED',
  'RC_SHARED_COLLECTED',
  'CASE_CLOSED',
  'REOPENED',
]);
export const rcDocumentStatusEnum = pgEnum('rc_document_status', [
  'PENDING_UPLOAD',
  'PENDING_SCAN',
  'VERIFIED',
  'REJECTED',
]);
export const rcDeliveryModeEnum = pgEnum('rc_delivery_mode', [
  'WHATSAPP',
  'EMAIL',
  'SMS',
  'COURIER',
  'PICKUP',
]);
export const vehicleOwnershipSourceEnum = pgEnum('vehicle_ownership_source', [
  'DEALERSHIP_SALE',
  'EXTERNAL',
]);

export const registrationSettings = pgTable(
  'registration_settings',
  {
    clientOrganizationId: uuid('client_organization_id').primaryKey(),
    slaHours: jsonb('sla_hours')
      .$type<Record<string, number>>()
      .default({
        DOCUMENTS_READY: 48,
        REGISTRATION_STARTED: 48,
        RTO_SUBMITTED: 168,
        NUMBER_ALLOTTED: 168,
        RC_PENDING: 720,
        RC_RECEIVED: 48,
        RC_SHARED_COLLECTED: 48,
        REOPENED: 48,
      })
      .notNull(),
    version: integer('version').default(1).notNull(),
    updatedByMembershipId: uuid('updated_by_membership_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.updatedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'registration_settings_actor_tenant_fk',
    }).onDelete('restrict'),
    check('registration_settings_version_check', sql`${table.version} >= 1`),
  ],
);

export const registrationCases = pgTable(
  'registration_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    bookingId: uuid('booking_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    inventoryUnitId: uuid('inventory_unit_id').notNull(),
    assignedMembershipId: uuid('assigned_membership_id'),
    assignedUserId: uuid('assigned_user_id'),
    status: registrationStatusEnum('status').default('DOCUMENTS_READY').notNull(),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    applicationStartedAt: timestamp('application_started_at', { withTimezone: true, mode: 'date' }),
    rtoName: varchar('rto_name', { length: 160 }),
    rtoCode: varchar('rto_code', { length: 32 }),
    applicationNumber: varchar('application_number', { length: 100 }),
    rtoSubmittedAt: timestamp('rto_submitted_at', { withTimezone: true, mode: 'date' }),
    expectedCompletionAt: timestamp('expected_completion_at', {
      withTimezone: true,
      mode: 'date',
    }),
    temporaryRegistrationNumber: varchar('temporary_registration_number', { length: 32 }),
    permanentRegistrationNumber: varchar('permanent_registration_number', { length: 32 }),
    numberAllottedAt: timestamp('number_allotted_at', { withTimezone: true, mode: 'date' }),
    pendingReason: text('pending_reason'),
    rcReceivedAt: timestamp('rc_received_at', { withTimezone: true, mode: 'date' }),
    sharedOrCollectedAt: timestamp('shared_or_collected_at', {
      withTimezone: true,
      mode: 'date',
    }),
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    reopenedAt: timestamp('reopened_at', { withTimezone: true, mode: 'date' }),
    version: integer('version').default(1).notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'registration_cases_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'registration_cases_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'registration_cases_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'registration_cases_inventory_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.assignedMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'registration_cases_assignee_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedUserId, table.assignedMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'registration_cases_assignee_user_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'registration_cases_creator_tenant_fk',
    }).onDelete('restrict'),
    unique('registration_cases_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('registration_cases_booking_uidx').on(table.clientOrganizationId, table.bookingId),
    index('registration_cases_queue_idx').on(
      table.clientOrganizationId,
      table.branchId,
      table.status,
      table.statusChangedAt,
    ),
    index('registration_cases_assignee_idx').on(
      table.clientOrganizationId,
      table.assignedMembershipId,
      table.status,
    ),
    index('registration_cases_client_created_idx').on(
      table.clientOrganizationId,
      table.createdAt,
      table.status,
      table.id,
    ),
    index('registration_cases_status_changed_idx').on(
      table.clientOrganizationId,
      table.statusChangedAt,
      table.id,
    ),
    check('registration_cases_version_check', sql`${table.version} >= 1`),
  ],
);

export const registrationEvents = pgTable(
  'registration_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    registrationCaseId: uuid('registration_case_id').notNull(),
    fromStatus: registrationStatusEnum('from_status'),
    toStatus: registrationStatusEnum('to_status').notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    reason: text('reason'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    correctsEventId: uuid('corrects_event_id'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.registrationCaseId],
      foreignColumns: [registrationCases.clientOrganizationId, registrationCases.id],
      name: 'registration_events_case_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'registration_events_actor_tenant_fk',
    }).onDelete('restrict'),
    unique('registration_events_client_id_unique').on(table.clientOrganizationId, table.id),
    index('registration_events_timeline_idx').on(
      table.clientOrganizationId,
      table.registrationCaseId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const rcDocuments = pgTable(
  'rc_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    registrationCaseId: uuid('registration_case_id').notNull(),
    storageKey: text('storage_key').notNull(),
    fileName: varchar('file_name', { length: 240 }).notNull(),
    contentType: varchar('content_type', { length: 100 }).notNull(),
    contentLength: integer('content_length').notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 44 }).notNull(),
    scannerStatus: varchar('scanner_status', { length: 32 }),
    status: rcDocumentStatusEnum('status').default('PENDING_UPLOAD').notNull(),
    uploadedByMembershipId: uuid('uploaded_by_membership_id').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' }),
    reviewedByMembershipId: uuid('reviewed_by_membership_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewReason: text('review_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.registrationCaseId],
      foreignColumns: [registrationCases.clientOrganizationId, registrationCases.id],
      name: 'rc_documents_case_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.uploadedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'rc_documents_uploader_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.reviewedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'rc_documents_reviewer_tenant_fk',
    }).onDelete('restrict'),
    unique('rc_documents_client_id_unique').on(table.clientOrganizationId, table.id),
    index('rc_documents_case_idx').on(table.clientOrganizationId, table.registrationCaseId),
    check(
      'rc_documents_size_check',
      sql`${table.contentLength} > 0 and ${table.contentLength} <= 20971520`,
    ),
  ],
);

export const rcDeliveryRecords = pgTable(
  'rc_delivery_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    registrationCaseId: uuid('registration_case_id').notNull(),
    rcDocumentId: uuid('rc_document_id').notNull(),
    deliveryMode: rcDeliveryModeEnum('delivery_mode').notNull(),
    recipient: varchar('recipient', { length: 240 }).notNull(),
    purpose: text('purpose').notNull(),
    deliveredByMembershipId: uuid('delivered_by_membership_id').notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    linkExpiresAt: timestamp('link_expires_at', { withTimezone: true, mode: 'date' }),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.registrationCaseId],
      foreignColumns: [registrationCases.clientOrganizationId, registrationCases.id],
      name: 'rc_delivery_case_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.rcDocumentId],
      foreignColumns: [rcDocuments.clientOrganizationId, rcDocuments.id],
      name: 'rc_delivery_document_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveredByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'rc_delivery_actor_tenant_fk',
    }).onDelete('restrict'),
    unique('rc_delivery_client_id_unique').on(table.clientOrganizationId, table.id),
    index('rc_delivery_case_timeline_idx').on(
      table.clientOrganizationId,
      table.registrationCaseId,
      table.deliveredAt,
    ),
  ],
);

export const customerVehicles = pgTable(
  'customer_vehicles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    ownershipSource: vehicleOwnershipSourceEnum('ownership_source').notNull(),
    bookingId: uuid('booking_id'),
    deliveryJobId: uuid('delivery_job_id'),
    registrationCaseId: uuid('registration_case_id'),
    inventoryUnitId: uuid('inventory_unit_id'),
    brandName: varchar('brand_name', { length: 120 }).notNull(),
    modelName: varchar('model_name', { length: 120 }).notNull(),
    variantName: varchar('variant_name', { length: 160 }).notNull(),
    vin: varchar('vin', { length: 80 }),
    engineNumber: varchar('engine_number', { length: 80 }),
    registrationNumber: varchar('registration_number', { length: 32 }),
    purchaseDate: date('purchase_date'),
    invoiceDate: date('invoice_date'),
    deliveryDate: date('delivery_date'),
    insurancePolicyNumber: varchar('insurance_policy_number', { length: 100 }),
    insuranceExpiresOn: date('insurance_expires_on'),
    warrantyExpiresOn: date('warranty_expires_on'),
    amcExpiresOn: date('amc_expires_on'),
    rsaExpiresOn: date('rsa_expires_on'),
    modelYear: integer('model_year'),
    pucExpiresOn: date('puc_expires_on'),
    currentOdometerKm: integer('current_odometer_km'),
    servicePlanVersion: varchar('service_plan_version', { length: 64 }),
    serviceDueOn: date('service_due_on'),
    serviceDueKilometres: integer('service_due_kilometres'),
    version: integer('version').default(1).notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'customer_vehicles_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.contactId],
      foreignColumns: [contacts.clientOrganizationId, contacts.id],
      name: 'customer_vehicles_contact_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.bookingId],
      foreignColumns: [bookings.clientOrganizationId, bookings.id],
      name: 'customer_vehicles_booking_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.deliveryJobId],
      foreignColumns: [deliveryJobs.clientOrganizationId, deliveryJobs.id],
      name: 'customer_vehicles_delivery_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.registrationCaseId],
      foreignColumns: [registrationCases.clientOrganizationId, registrationCases.id],
      name: 'customer_vehicles_registration_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'customer_vehicles_inventory_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'customer_vehicles_creator_tenant_fk',
    }).onDelete('restrict'),
    unique('customer_vehicles_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('customer_vehicles_booking_uidx')
      .on(table.clientOrganizationId, table.bookingId)
      .where(sql`${table.bookingId} is not null`),
    uniqueIndex('customer_vehicles_vin_uidx')
      .on(table.clientOrganizationId, sql`upper(${table.vin})`)
      .where(sql`${table.vin} is not null`),
    uniqueIndex('customer_vehicles_registration_uidx')
      .on(table.clientOrganizationId, sql`upper(${table.registrationNumber})`)
      .where(sql`${table.registrationNumber} is not null`),
    index('customer_vehicles_contact_idx').on(
      table.clientOrganizationId,
      table.contactId,
      table.createdAt,
    ),
    index('customer_vehicles_client_created_idx').on(
      table.clientOrganizationId,
      table.createdAt,
      table.id,
    ),
    check('customer_vehicles_version_check', sql`${table.version} >= 1`),
    check(
      'customer_vehicles_odometer_check',
      sql`${table.currentOdometerKm} is null or ${table.currentOdometerKm} >= 0`,
    ),
    check(
      'customer_vehicles_source_check',
      sql`(${table.ownershipSource} = 'DEALERSHIP_SALE' and ${table.bookingId} is not null and ${table.deliveryJobId} is not null and ${table.inventoryUnitId} is not null) or (${table.ownershipSource} = 'EXTERNAL' and ${table.bookingId} is null and ${table.deliveryJobId} is null and ${table.registrationCaseId} is null and ${table.inventoryUnitId} is null)`,
    ),
    check(
      'customer_vehicles_identity_check',
      sql`${table.vin} is not null or ${table.registrationNumber} is not null`,
    ),
  ],
);

export const customerVehicleEvents = pgTable(
  'customer_vehicle_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    customerVehicleId: uuid('customer_vehicle_id').notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    reason: text('reason'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.customerVehicleId],
      foreignColumns: [customerVehicles.clientOrganizationId, customerVehicles.id],
      name: 'customer_vehicle_events_vehicle_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'customer_vehicle_events_actor_tenant_fk',
    }).onDelete('restrict'),
    index('customer_vehicle_events_timeline_idx').on(
      table.clientOrganizationId,
      table.customerVehicleId,
      table.createdAt,
    ),
  ],
);

export const registrationCommandReceipts = pgTable(
  'registration_command_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    commandType: varchar('command_type', { length: 100 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    responseSnapshot: jsonb('response_snapshot')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'registration_receipts_actor_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('registration_receipts_key_uidx').on(
      table.clientOrganizationId,
      table.idempotencyKey,
    ),
  ],
);
