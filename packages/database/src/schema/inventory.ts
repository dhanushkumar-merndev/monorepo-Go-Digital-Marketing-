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
import { leadOpportunities } from './leads.js';
import { branches, clientOrganizations } from './organizations.js';

export const inventoryUnitStatusEnum = pgEnum('inventory_unit_status', [
  'EXPECTED',
  'AVAILABLE',
  'RESERVED',
  'ALLOCATED',
  'DEMO',
  'IN_TRANSFER',
  'DELIVERED',
  'BLOCKED',
  'CANCELLED',
  'REMOVED',
]);
export const inventoryReservationStatusEnum = pgEnum('inventory_reservation_status', [
  'ACTIVE',
  'RELEASED',
  'EXPIRED',
  'CANCELLED',
  'CONVERTED',
]);
export const inventoryAllocationStatusEnum = pgEnum('inventory_allocation_status', [
  'ACTIVE',
  'RELEASED',
  'REPLACED',
  'DELIVERED',
]);
export const inventoryTransferEventTypeEnum = pgEnum('inventory_transfer_event_type', [
  'STARTED',
  'COMPLETED',
  'CANCELLED',
]);

export const inventoryBrands = pgTable(
  'inventory_brands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'inventory_brands_client_fk',
    }).onDelete('restrict'),
    uniqueIndex('inventory_brands_client_code_uidx').on(table.clientOrganizationId, table.code),
    unique('inventory_brands_client_id_unique').on(table.clientOrganizationId, table.id),
  ],
);

export const inventoryModels = pgTable(
  'inventory_models',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    brandId: uuid('brand_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.brandId],
      foreignColumns: [inventoryBrands.clientOrganizationId, inventoryBrands.id],
      name: 'inventory_models_brand_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('inventory_models_client_brand_code_uidx').on(
      table.clientOrganizationId,
      table.brandId,
      table.code,
    ),
    unique('inventory_models_client_id_unique').on(table.clientOrganizationId, table.id),
  ],
);

export const inventoryVariants = pgTable(
  'inventory_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    modelId: uuid('model_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    fuelPowertrain: varchar('fuel_powertrain', { length: 80 }).notNull(),
    modelYear: integer('model_year').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.modelId],
      foreignColumns: [inventoryModels.clientOrganizationId, inventoryModels.id],
      name: 'inventory_variants_model_tenant_fk',
    }).onDelete('restrict'),
    uniqueIndex('inventory_variants_client_model_code_uidx').on(
      table.clientOrganizationId,
      table.modelId,
      table.code,
    ),
    unique('inventory_variants_client_id_unique').on(table.clientOrganizationId, table.id),
    check('inventory_variants_model_year_check', sql`${table.modelYear} between 1900 and 2200`),
  ],
);

export const inventoryColours = pgTable(
  'inventory_colours',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'inventory_colours_client_fk',
    }).onDelete('restrict'),
    uniqueIndex('inventory_colours_client_code_uidx').on(table.clientOrganizationId, table.code),
    unique('inventory_colours_client_id_unique').on(table.clientOrganizationId, table.id),
  ],
);

export const inventoryUnits = pgTable(
  'inventory_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    variantId: uuid('variant_id').notNull(),
    colourId: uuid('colour_id').notNull(),
    unitReference: varchar('unit_reference', { length: 100 }).notNull(),
    vin: varchar('vin', { length: 64 }),
    chassisNumber: varchar('chassis_number', { length: 80 }),
    engineNumber: varchar('engine_number', { length: 80 }),
    status: inventoryUnitStatusEnum('status').default('EXPECTED').notNull(),
    ownershipType: varchar('ownership_type', { length: 64 }).notNull(),
    acquisitionReference: varchar('acquisition_reference', { length: 120 }),
    expectedArrivalAt: timestamp('expected_arrival_at', { withTimezone: true, mode: 'date' }),
    receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }),
    currentOdometerKm: integer('current_odometer_km').default(0).notNull(),
    conditionNotes: text('condition_notes'),
    serviceDueAt: timestamp('service_due_at', { withTimezone: true, mode: 'date' }),
    blockedReason: text('blocked_reason'),
    version: integer('version').default(1).notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'inventory_units_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.variantId],
      foreignColumns: [inventoryVariants.clientOrganizationId, inventoryVariants.id],
      name: 'inventory_units_variant_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.colourId],
      foreignColumns: [inventoryColours.clientOrganizationId, inventoryColours.id],
      name: 'inventory_units_colour_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'inventory_units_creator_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdByUserId, table.createdByMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'inventory_units_creator_user_membership_fk',
    }).onDelete('restrict'),
    unique('inventory_units_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('inventory_units_client_reference_uidx').on(
      table.clientOrganizationId,
      table.unitReference,
    ),
    uniqueIndex('inventory_units_client_vin_uidx')
      .on(table.clientOrganizationId, table.vin)
      .where(sql`${table.vin} is not null`),
    uniqueIndex('inventory_units_client_chassis_uidx')
      .on(table.clientOrganizationId, table.chassisNumber)
      .where(sql`${table.chassisNumber} is not null`),
    uniqueIndex('inventory_units_client_engine_uidx')
      .on(table.clientOrganizationId, table.engineNumber)
      .where(sql`${table.engineNumber} is not null`),
    index('inventory_units_client_branch_status_idx').on(
      table.clientOrganizationId,
      table.branchId,
      table.status,
    ),
    index('inventory_units_client_variant_status_idx').on(
      table.clientOrganizationId,
      table.variantId,
      table.status,
    ),
    index('inventory_units_expected_arrival_idx').on(
      table.clientOrganizationId,
      table.status,
      table.expectedArrivalAt,
    ),
    check('inventory_units_version_check', sql`${table.version} >= 1`),
    check('inventory_units_odometer_check', sql`${table.currentOdometerKm} >= 0`),
  ],
);

export const inventoryUnitStatusHistory = pgTable(
  'inventory_unit_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    inventoryUnitId: uuid('inventory_unit_id').notNull(),
    fromStatus: inventoryUnitStatusEnum('from_status'),
    toStatus: inventoryUnitStatusEnum('to_status').notNull(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    reason: text('reason'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    actorUserId: uuid('actor_user_id'),
    actorMembershipId: uuid('actor_membership_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'inventory_history_unit_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'inventory_history_actor_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.actorUserId, table.actorMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'inventory_history_actor_user_membership_fk',
    }).onDelete('restrict'),
    unique('inventory_history_client_id_unique').on(table.clientOrganizationId, table.id),
    index('inventory_history_unit_timeline_idx').on(
      table.clientOrganizationId,
      table.inventoryUnitId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const inventoryReservations = pgTable(
  'inventory_reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    inventoryUnitId: uuid('inventory_unit_id').notNull(),
    leadId: uuid('lead_id'),
    bookingReference: varchar('booking_reference', { length: 120 }),
    status: inventoryReservationStatusEnum('status').default('ACTIVE').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    reason: text('reason').notNull(),
    releasedReason: text('released_reason'),
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'inventory_reservations_unit_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.leadId],
      foreignColumns: [leadOpportunities.clientOrganizationId, leadOpportunities.id],
      name: 'inventory_reservations_lead_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.createdByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'inventory_reservations_creator_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.createdByUserId, table.createdByMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'inventory_reservations_creator_user_membership_fk',
    }).onDelete('restrict'),
    unique('inventory_reservations_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('inventory_reservations_active_unit_uidx')
      .on(table.clientOrganizationId, table.inventoryUnitId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('inventory_reservations_expiry_idx').on(
      table.clientOrganizationId,
      table.status,
      table.expiresAt,
    ),
    check(
      'inventory_reservations_context_check',
      sql`${table.leadId} is not null or ${table.bookingReference} is not null`,
    ),
  ],
);

export const inventoryAllocations = pgTable(
  'inventory_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    inventoryUnitId: uuid('inventory_unit_id').notNull(),
    bookingReference: varchar('booking_reference', { length: 120 }).notNull(),
    status: inventoryAllocationStatusEnum('status').default('ACTIVE').notNull(),
    readinessAsserted: boolean('readiness_asserted').notNull(),
    reason: text('reason').notNull(),
    customerCommunicationDecision: text('customer_communication_decision'),
    replacesAllocationId: uuid('replaces_allocation_id'),
    allocatedByUserId: uuid('allocated_by_user_id').notNull(),
    allocatedByMembershipId: uuid('allocated_by_membership_id').notNull(),
    allocatedAt: timestamp('allocated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'inventory_allocations_unit_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.replacesAllocationId],
      foreignColumns: [table.clientOrganizationId, table.id],
      name: 'inventory_allocations_replacement_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.allocatedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'inventory_allocations_actor_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.allocatedByUserId, table.allocatedByMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'inventory_allocations_actor_user_membership_fk',
    }).onDelete('restrict'),
    unique('inventory_allocations_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('inventory_allocations_active_unit_uidx')
      .on(table.clientOrganizationId, table.inventoryUnitId)
      .where(sql`${table.status} = 'ACTIVE'`),
    uniqueIndex('inventory_allocations_active_booking_uidx')
      .on(table.clientOrganizationId, table.bookingReference)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('inventory_allocations_queue_idx').on(
      table.clientOrganizationId,
      table.status,
      table.allocatedAt,
    ),
    check('inventory_allocations_readiness_check', sql`${table.readinessAsserted} = true`),
  ],
);

export const inventoryTransfers = pgTable(
  'inventory_transfers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    inventoryUnitId: uuid('inventory_unit_id').notNull(),
    fromBranchId: uuid('from_branch_id').notNull(),
    toBranchId: uuid('to_branch_id').notNull(),
    priorStatus: inventoryUnitStatusEnum('prior_status').notNull(),
    reference: varchar('reference', { length: 120 }).notNull(),
    reason: text('reason').notNull(),
    initiatedByUserId: uuid('initiated_by_user_id').notNull(),
    initiatedByMembershipId: uuid('initiated_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'inventory_transfers_unit_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.fromBranchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'inventory_transfers_from_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.toBranchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'inventory_transfers_to_branch_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.initiatedByMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'inventory_transfers_actor_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.initiatedByUserId, table.initiatedByMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'inventory_transfers_actor_user_membership_fk',
    }).onDelete('restrict'),
    unique('inventory_transfers_client_id_unique').on(table.clientOrganizationId, table.id),
    index('inventory_transfers_unit_timeline_idx').on(
      table.clientOrganizationId,
      table.inventoryUnitId,
      table.createdAt,
      table.id,
    ),
    check('inventory_transfers_branch_check', sql`${table.fromBranchId} <> ${table.toBranchId}`),
    check(
      'inventory_transfers_prior_status_check',
      sql`${table.priorStatus} in ('AVAILABLE', 'DEMO', 'BLOCKED')`,
    ),
  ],
);

export const inventoryTransferEvents = pgTable(
  'inventory_transfer_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    transferId: uuid('transfer_id').notNull(),
    inventoryUnitId: uuid('inventory_unit_id').notNull(),
    eventType: inventoryTransferEventTypeEnum('event_type').notNull(),
    reason: text('reason'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().default({}).notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.transferId],
      foreignColumns: [inventoryTransfers.clientOrganizationId, inventoryTransfers.id],
      name: 'inventory_transfer_events_transfer_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.inventoryUnitId],
      foreignColumns: [inventoryUnits.clientOrganizationId, inventoryUnits.id],
      name: 'inventory_transfer_events_unit_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.actorMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'inventory_transfer_events_actor_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.actorUserId, table.actorMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'inventory_transfer_events_actor_user_membership_fk',
    }).onDelete('restrict'),
    unique('inventory_transfer_events_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('inventory_transfer_events_once_uidx').on(
      table.clientOrganizationId,
      table.transferId,
      table.eventType,
    ),
    index('inventory_transfer_events_timeline_idx').on(
      table.clientOrganizationId,
      table.transferId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const inventoryCommandReceipts = pgTable(
  'inventory_command_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    commandType: varchar('command_type', { length: 80 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    responseSnapshot: jsonb('response_snapshot').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'inventory_command_receipts_client_fk',
    }).onDelete('restrict'),
    uniqueIndex('inventory_command_receipts_key_uidx').on(
      table.clientOrganizationId,
      table.idempotencyKey,
    ),
  ],
);
