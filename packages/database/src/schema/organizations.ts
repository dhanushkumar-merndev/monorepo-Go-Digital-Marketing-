import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const agencyStatusEnum = pgEnum('agency_status', ['ACTIVE', 'SUSPENDED', 'CLOSED']);
export const clientOrganizationStatusEnum = pgEnum('client_organization_status', [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'CLOSED',
]);

export const agencies = pgTable(
  'agencies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 64 }).notNull(),
    legalName: varchar('legal_name', { length: 240 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    status: agencyStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('agencies_code_uidx').on(table.code),
    index('agencies_status_idx').on(table.status),
    check('agencies_code_not_blank_check', sql`char_length(trim(${table.code})) > 0`),
  ],
);

export const clientOrganizations = pgTable(
  'client_organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agencyId: uuid('agency_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    legalName: varchar('legal_name', { length: 240 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    status: clientOrganizationStatusEnum('status').default('PENDING').notNull(),
    timezone: varchar('timezone', { length: 64 }).default('Asia/Kolkata').notNull(),
    settingsVersion: integer('settings_version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.agencyId],
      foreignColumns: [agencies.id],
      name: 'client_organizations_agency_fk',
    }).onDelete('restrict'),
    uniqueIndex('client_organizations_agency_code_uidx').on(table.agencyId, table.code),
    uniqueIndex('client_organizations_id_agency_uidx').on(table.id, table.agencyId),
    index('client_organizations_agency_status_idx').on(table.agencyId, table.status),
    check('client_organizations_settings_version_check', sql`${table.settingsVersion} >= 1`),
  ],
);

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    timezone: varchar('timezone', { length: 64 }).default('Asia/Kolkata').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'branches_client_organization_fk',
    }).onDelete('restrict'),
    uniqueIndex('branches_client_code_uidx').on(table.clientOrganizationId, table.code),
    unique('branches_client_id_unique').on(table.clientOrganizationId, table.id),
    index('branches_client_active_idx').on(table.clientOrganizationId, table.active),
  ],
);

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'departments_client_branch_fk',
    }).onDelete('restrict'),
    uniqueIndex('departments_client_branch_code_uidx').on(
      table.clientOrganizationId,
      table.branchId,
      table.code,
    ),
    unique('departments_client_id_unique').on(table.clientOrganizationId, table.id),
    unique('departments_client_branch_id_unique').on(
      table.clientOrganizationId,
      table.branchId,
      table.id,
    ),
    index('departments_client_branch_active_idx').on(
      table.clientOrganizationId,
      table.branchId,
      table.active,
    ),
  ],
);

export const teams = pgTable(
  'teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    departmentId: uuid('department_id').notNull(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId, table.departmentId],
      foreignColumns: [departments.clientOrganizationId, departments.branchId, departments.id],
      name: 'teams_client_branch_department_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'teams_client_branch_fk',
    }).onDelete('restrict'),
    uniqueIndex('teams_client_branch_code_uidx').on(
      table.clientOrganizationId,
      table.branchId,
      table.code,
    ),
    uniqueIndex('teams_client_id_uidx').on(table.clientOrganizationId, table.id),
    unique('teams_client_branch_id_unique').on(
      table.clientOrganizationId,
      table.branchId,
      table.id,
    ),
    unique('teams_client_branch_department_id_unique').on(
      table.clientOrganizationId,
      table.branchId,
      table.departmentId,
      table.id,
    ),
    index('teams_client_branch_active_idx').on(
      table.clientOrganizationId,
      table.branchId,
      table.active,
    ),
  ],
);
