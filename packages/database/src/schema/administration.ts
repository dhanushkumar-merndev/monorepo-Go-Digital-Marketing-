import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  time,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { agencies, branches, clientOrganizations } from './organizations.js';

export const agencyDefaults = pgTable(
  'agency_defaults',
  {
    agencyId: uuid('agency_id').primaryKey(),
    defaultTimezone: varchar('default_timezone', { length: 64 }).default('Asia/Kolkata').notNull(),
    defaultFeatureFlags: jsonb('default_feature_flags')
      .$type<Record<string, boolean>>()
      .default({})
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.agencyId],
      foreignColumns: [agencies.id],
      name: 'agency_defaults_agency_fk',
    }).onDelete('restrict'),
  ],
);

export const clientModuleFlags = pgTable(
  'client_module_flags',
  {
    clientOrganizationId: uuid('client_organization_id').notNull(),
    module: varchar('module', { length: 64 }).notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    reason: varchar('reason', { length: 500 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'client_module_flags_pk',
      columns: [table.clientOrganizationId, table.module],
    }),
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'client_module_flags_client_fk',
    }).onDelete('restrict'),
    check(
      'client_module_flags_module_not_blank_check',
      sql`char_length(trim(${table.module})) > 0`,
    ),
  ],
);

export const clientIntegrationReadiness = pgTable(
  'client_integration_readiness',
  {
    clientOrganizationId: uuid('client_organization_id').notNull(),
    integration: varchar('integration', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).default('NOT_CONNECTED').notNull(),
    detail: varchar('detail', { length: 500 }),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'client_integration_readiness_pk',
      columns: [table.clientOrganizationId, table.integration],
    }),
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'client_integration_readiness_client_fk',
    }).onDelete('restrict'),
    check(
      'client_integration_readiness_status_check',
      sql`${table.status} in ('NOT_CONNECTED', 'PENDING_APPROVAL', 'ACTIVE', 'DEGRADED', 'ACTION_REQUIRED', 'SUSPENDED')`,
    ),
  ],
);

export const clientAdministrationSettings = pgTable(
  'client_administration_settings',
  {
    clientOrganizationId: uuid('client_organization_id').primaryKey(),
    leadAssignmentReady: boolean('lead_assignment_ready').default(false).notNull(),
    retentionPolicy: jsonb('retention_policy')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    version: integer('version').default(1).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'client_administration_settings_client_fk',
    }).onDelete('restrict'),
    check('client_administration_settings_version_check', sql`${table.version} >= 1`),
  ],
);

export const branchWorkingHours = pgTable(
  'branch_working_hours',
  {
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    dayOfWeek: integer('day_of_week').notNull(),
    isClosed: boolean('is_closed').default(false).notNull(),
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),
    version: integer('version').default(1).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ name: 'branch_working_hours_pk', columns: [table.branchId, table.dayOfWeek] }),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'branch_working_hours_branch_fk',
    }).onDelete('restrict'),
    check('branch_working_hours_day_check', sql`${table.dayOfWeek} between 0 and 6`),
    check(
      'branch_working_hours_time_check',
      sql`(${table.isClosed} and ${table.opensAt} is null and ${table.closesAt} is null) or (not ${table.isClosed} and ${table.opensAt} is not null and ${table.closesAt} is not null and ${table.opensAt} < ${table.closesAt})`,
    ),
    check('branch_working_hours_version_check', sql`${table.version} >= 1`),
    index('branch_working_hours_client_branch_idx').on(table.clientOrganizationId, table.branchId),
  ],
);
