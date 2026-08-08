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

import { agencies, branches, clientOrganizations, departments, teams } from './organizations.js';
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
  'TEAM_MANAGER',
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
  'organization.branches.manage',
  'organization.teams.manage',
  'organization.settings.manage',
  'organization.audit.read',
  'platform.agencies.manage',
  'platform.clients.manage',
  'platform.defaults.manage',
  'platform.support_elevation.manage',
  'leads.read',
  'leads.create',
  'leads.transition',
  'leads.assign',
  'leads.followups.manage',
  'leads.notes.create',
  'leads.tasks.manage',
  'leads.duplicates.manage',
  'leads.sla.manage',
  'organization.departments.read',
  'organization.departments.manage',
  'organization.hierarchy.read',
  'organization.hierarchy.manage',
  'telephony.calls.read',
  'telephony.calls.start',
  'telephony.outcomes.manage',
  'telephony.outcomes.override',
  'telephony.recordings.read',
  'telephony.recordings.upload',
  'telephony.connections.manage',
  'telephony.reconciliation.manage',
  'telephony.health.read',
  'messaging.conversations.read',
  'messaging.messages.send',
  'messaging.notes.create',
  'messaging.assignments.manage',
  'messaging.templates.read',
  'messaging.templates.manage',
  'messaging.connections.manage',
  'messaging.failures.manage',
  'messaging.media.read',
  'messaging.media.upload',
] as const;

// Retained only so Drizzle recognizes the pre-Phase-4 PostgreSQL enum while the
// migration converts permissions.code to varchar. New permission codes must not
// be added to this legacy enum.
const legacyPermissionCodes = PERMISSION_CODES.filter(
  (code) => !code.startsWith('telephony.') && !code.startsWith('messaging.'),
) as unknown as [string, ...string[]];

export const canonicalRoleCodeEnum = pgEnum('canonical_role_code', CANONICAL_ROLE_CODES);
export const legacyPermissionCodeEnum = pgEnum('permission_code', legacyPermissionCodes);
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
    // Permission codes evolve by phase. Keep TypeScript's canonical union while avoiding
    // PostgreSQL enum transaction restrictions during a rolling migration.
    code: varchar('code', { length: 100 }).$type<(typeof PERMISSION_CODES)[number]>().notNull(),
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
    departmentScopeMode: membershipScopeModeEnum('department_scope_mode').default('NONE').notNull(),
    teamScopeMode: membershipScopeModeEnum('team_scope_mode').default('NONE').notNull(),
    assignmentScope: assignmentScopeEnum('assignment_scope').default('NONE').notNull(),
    jobTitle: varchar('job_title', { length: 160 }),
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
        AND ${table.departmentScopeMode} = 'NONE'
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

export const membershipDepartmentScopes = pgTable(
  'membership_department_scopes',
  {
    clientOrganizationId: uuid('client_organization_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    departmentId: uuid('department_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      name: 'membership_department_scopes_pk',
      columns: [table.membershipId, table.departmentId],
    }),
    foreignKey({
      columns: [table.clientOrganizationId, table.membershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'membership_department_scopes_membership_tenant_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId, table.departmentId],
      foreignColumns: [departments.clientOrganizationId, departments.branchId, departments.id],
      name: 'membership_department_scopes_department_tenant_fk',
    }).onDelete('restrict'),
    index('membership_department_scopes_client_department_idx').on(
      table.clientOrganizationId,
      table.departmentId,
    ),
  ],
);

export const teamMemberships = pgTable(
  'team_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    departmentId: uuid('department_id').notNull(),
    teamId: uuid('team_id').notNull(),
    membershipId: uuid('membership_id').notNull(),
    reason: text('reason').notNull(),
    assignedBy: uuid('assigned_by'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId, table.departmentId, table.teamId],
      foreignColumns: [teams.clientOrganizationId, teams.branchId, teams.departmentId, teams.id],
      name: 'team_memberships_team_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.membershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'team_memberships_membership_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [users.id],
      name: 'team_memberships_assigned_by_fk',
    }).onDelete('restrict'),
    uniqueIndex('team_memberships_active_uidx')
      .on(table.clientOrganizationId, table.teamId, table.membershipId)
      .where(sql`${table.endedAt} is null`),
    index('team_memberships_member_active_idx').on(
      table.clientOrganizationId,
      table.membershipId,
      table.endedAt,
    ),
    check(
      'team_memberships_window_check',
      sql`${table.endedAt} is null or ${table.endedAt} > ${table.startedAt}`,
    ),
  ],
);

export const teamManagerAssignments = pgTable(
  'team_manager_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    departmentId: uuid('department_id').notNull(),
    teamId: uuid('team_id').notNull(),
    managerMembershipId: uuid('manager_membership_id').notNull(),
    reason: text('reason').notNull(),
    assignedBy: uuid('assigned_by'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.branchId, table.departmentId, table.teamId],
      foreignColumns: [teams.clientOrganizationId, teams.branchId, teams.departmentId, teams.id],
      name: 'team_manager_assignments_team_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.managerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'team_manager_assignments_manager_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [users.id],
      name: 'team_manager_assignments_assigned_by_fk',
    }).onDelete('restrict'),
    uniqueIndex('team_manager_assignments_current_team_uidx')
      .on(table.clientOrganizationId, table.teamId)
      .where(sql`${table.endedAt} is null`),
    index('team_manager_assignments_manager_active_idx').on(
      table.clientOrganizationId,
      table.managerMembershipId,
      table.endedAt,
    ),
    check(
      'team_manager_assignments_window_check',
      sql`${table.endedAt} is null or ${table.endedAt} > ${table.startedAt}`,
    ),
  ],
);

export const reportingLines = pgTable(
  'reporting_lines',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    subordinateMembershipId: uuid('subordinate_membership_id').notNull(),
    managerMembershipId: uuid('manager_membership_id').notNull(),
    reason: text('reason').notNull(),
    assignedBy: uuid('assigned_by'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId, table.subordinateMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'reporting_lines_subordinate_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.clientOrganizationId, table.managerMembershipId],
      foreignColumns: [memberships.clientOrganizationId, memberships.id],
      name: 'reporting_lines_manager_tenant_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.assignedBy],
      foreignColumns: [users.id],
      name: 'reporting_lines_assigned_by_fk',
    }).onDelete('restrict'),
    uniqueIndex('reporting_lines_current_subordinate_uidx')
      .on(table.clientOrganizationId, table.subordinateMembershipId)
      .where(sql`${table.endedAt} is null`),
    index('reporting_lines_manager_active_idx').on(
      table.clientOrganizationId,
      table.managerMembershipId,
      table.endedAt,
    ),
    check(
      'reporting_lines_not_self_check',
      sql`${table.subordinateMembershipId} <> ${table.managerMembershipId}`,
    ),
    check(
      'reporting_lines_window_check',
      sql`${table.endedAt} is null or ${table.endedAt} > ${table.startedAt}`,
    ),
  ],
);
