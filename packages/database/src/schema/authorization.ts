import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
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

import { agencies, branches, clientOrganizations, teams } from './organizations.js';
import { users } from './users.js';

export const CANONICAL_ROLE_CODES = [
  'AGENCY_ADMIN',
  'CLIENT_ADMIN',
  'MANAGER',
  'SALES_MANAGER',
  'TELECALLER',
  'SALESPERSON',
  'TEST_RIDE_EXECUTIVE',
  'INVENTORY_EXECUTIVE',
  'BILLING_DOCUMENTATION_EXECUTIVE',
  'DELIVERY_EXECUTIVE',
  'RC_REGISTRATION_EXECUTIVE',
] as const;

export const PERMISSION_CODES = [
  'account.profile.read',
  'account.profile.update',
  'account.sessions.read',
  'account.sessions.revoke',
  'account.tenant.select',
  'organization.clients.read',
  'organization.branches.read',
  'organization.teams.read',
  'organization.users.read',
  'organization.users.manage',
  'organization.roles.read',
  'organization.roles.manage',
  'organization.sessions.manage',
  'platform.agencies.manage',
  'platform.clients.manage',
  'platform.support_elevation.manage',
] as const;

export const canonicalRoleCodeEnum = pgEnum('canonical_role_code', CANONICAL_ROLE_CODES);
export const permissionCodeEnum = pgEnum('permission_code', PERMISSION_CODES);
export const membershipContextTypeEnum = pgEnum('membership_context_type', ['AGENCY', 'CLIENT']);
export const membershipStatusEnum = pgEnum('membership_status', [
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'ENDED',
]);
export const membershipScopeModeEnum = pgEnum('membership_scope_mode', ['ALL', 'SELECTED', 'NONE']);
export const assignmentScopeEnum = pgEnum('assignment_scope', [
  'ALL',
  'TEAM',
  'OWNED',
  'ASSIGNED',
  'OWNED_OR_ASSIGNED',
  'NONE',
]);
export const roleApplicationEnum = pgEnum('role_application', ['WEB', 'MOBILE']);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: canonicalRoleCodeEnum('code').notNull(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    contextType: membershipContextTypeEnum('context_type').notNull(),
    application: roleApplicationEnum('application').notNull(),
    description: text('description').notNull(),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('roles_code_uidx').on(table.code),
    unique('roles_id_context_unique').on(table.id, table.contextType),
    index('roles_context_active_idx').on(table.contextType, table.active),
  ],
);

export const permissions = pgTable(
  'permissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: permissionCodeEnum('code').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('permissions_code_uidx').on(table.code)],
);

export const rolePermissionMappings = pgTable(
  'role_permission_mappings',
  {
    roleId: uuid('role_id').notNull(),
    permissionId: uuid('permission_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'role_permission_mappings_pk',
      columns: [table.roleId, table.permissionId],
    }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [roles.id],
      name: 'role_permission_mappings_role_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permissions.id],
      name: 'role_permission_mappings_permission_fk',
    }).onDelete('cascade'),
    index('role_permission_mappings_permission_idx').on(table.permissionId),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    contextType: membershipContextTypeEnum('context_type').notNull(),
    agencyId: uuid('agency_id'),
    clientOrganizationId: uuid('client_organization_id'),
    roleId: uuid('role_id').notNull(),
    status: membershipStatusEnum('status').default('INVITED').notNull(),
    branchScopeMode: membershipScopeModeEnum('branch_scope_mode').default('NONE').notNull(),
    teamScopeMode: membershipScopeModeEnum('team_scope_mode').default('NONE').notNull(),
    assignmentScope: assignmentScopeEnum('assignment_scope').default('NONE').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    effectiveUntil: timestamp('effective_until', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'memberships_user_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.roleId, table.contextType],
      foreignColumns: [roles.id, roles.contextType],
      name: 'memberships_role_context_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.agencyId],
      foreignColumns: [agencies.id],
      name: 'memberships_agency_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'memberships_client_organization_fk',
    }).onDelete('restrict'),
    unique('memberships_id_context_unique').on(table.id, table.contextType),
    unique('memberships_user_id_unique').on(table.userId, table.id),
    unique('memberships_client_id_unique').on(table.clientOrganizationId, table.id),
    uniqueIndex('memberships_active_agency_uidx')
      .on(table.userId, table.agencyId)
      .where(sql`${table.status} = 'ACTIVE' AND ${table.agencyId} IS NOT NULL`),
    uniqueIndex('memberships_active_client_uidx')
      .on(table.userId, table.clientOrganizationId)
      .where(sql`${table.status} = 'ACTIVE' AND ${table.clientOrganizationId} IS NOT NULL`),
    index('memberships_user_status_idx').on(table.userId, table.status),
    index('memberships_client_status_idx').on(table.clientOrganizationId, table.status),
    check(
      'memberships_context_check',
      sql`(
        ${table.contextType} = 'AGENCY'
        AND ${table.agencyId} IS NOT NULL
        AND ${table.clientOrganizationId} IS NULL
        AND ${table.branchScopeMode} = 'NONE'
        AND ${table.teamScopeMode} = 'NONE'
        AND ${table.assignmentScope} = 'NONE'
      ) OR (
        ${table.contextType} = 'CLIENT'
        AND ${table.agencyId} IS NULL
        AND ${table.clientOrganizationId} IS NOT NULL
      )`,
    ),
    check(
      'memberships_effective_window_check',
      sql`${table.effectiveUntil} IS NULL OR ${table.effectiveUntil} > ${table.effectiveFrom}`,
    ),
  ],
);

export const membershipBranchScopes = pgTable(
  'membership_branch_scopes',
  {
    clientOrganizationId: uuid('client_organization_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'membership_branch_scopes_pk',
      columns: [table.membershipId, table.branchId],
    }),
    foreignKey({
      columns: [table.clientOrganizationId, table.membershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'membership_branch_scopes_membership_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId],
      foreignColumns: [branches.clientOrganizationId, branches.id],
      name: 'membership_branch_scopes_branch_tenant_fk',
    }).onDelete('restrict'),
    index('membership_branch_scopes_client_branch_idx').on(
      table.clientOrganizationId,
      table.branchId,
    ),
  ],
);

export const membershipTeamScopes = pgTable(
  'membership_team_scopes',
  {
    clientOrganizationId: uuid('client_organization_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    teamId: uuid('team_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'membership_team_scopes_pk',
      columns: [table.membershipId, table.teamId],
    }),
    foreignKey({
      columns: [table.clientOrganizationId, table.membershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'membership_team_scopes_membership_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId, table.teamId],
      foreignColumns: [teams.clientOrganizationId, teams.branchId, teams.id],
      name: 'membership_team_scopes_team_tenant_fk',
    }).onDelete('restrict'),
    index('membership_team_scopes_client_team_idx').on(table.clientOrganizationId, table.teamId),
  ],
);
