import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { AdministrationService } from '../src/administration/administration.service.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { schema, type DatabaseConnection } from '@gdm/database';
import type { PermissionCode } from '@gdm/contracts';
import { and, eq } from 'drizzle-orm';

const agencyId = '10000000-0000-4000-8000-000000000001';
const clientId = '20000000-0000-4000-8000-000000000001';
const adminUserId = '50000000-0000-4000-8000-000000000001';
const adminMembershipId = '60000000-0000-4000-8000-000000000001';

function agencyContext(): AuthorizationContext {
  return {
    agencyId,
    assignmentScope: 'NONE' as const,
    branchIds: new Set<string>(),
    branchScopeMode: 'NONE' as const,
    departmentIds: new Set<string>(),
    departmentScopeMode: 'NONE' as const,
    managedTeamIds: new Set<string>(),
    membershipId: '70000000-0000-4000-8000-000000000001',
    permissionCodes: new Set<PermissionCode>(),
    roleCode: 'AGENCY_ADMIN',
    sessionId: '80000000-0000-4000-8000-000000000001',
    teamIds: new Set<string>(),
    teamScopeMode: 'NONE' as const,
    userId: adminUserId,
  };
}
function clientContext(): AuthorizationContext {
  const { agencyId: _agencyId, ...context } = agencyContext();
  return {
    ...context,
    branchScopeMode: 'ALL',
    clientOrganizationId: clientId,
    departmentScopeMode: 'ALL',
    roleCode: 'CLIENT_ADMIN',
    membershipId: adminMembershipId,
    teamScopeMode: 'ALL',
  };
}

describe('Phase 2 administration business rules', () => {
  let database: MigratedPGliteTestDatabase | undefined;
  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it('applies agency safe defaults to a newly created client and audits lifecycle commands', async () => {
    database = await createMigratedPGliteTestDatabase();
    await database.db
      .insert(schema.agencies)
      .values({ id: agencyId, code: 'GDM', legalName: 'Go Digital', displayName: 'Go Digital' });
    const service = new AdministrationService({ db: database.db } as unknown as DatabaseConnection);
    await service.setDefaults(agencyContext(), {
      default_timezone: 'Asia/Kolkata',
      default_feature_flags: {
        LEADS: true,
        TELEPHONY: false,
        INBOX: false,
        TEST_RIDES: false,
        INVENTORY: false,
        BOOKING_BILLING: false,
        DELIVERY_RC: false,
        POST_SALE: false,
        INTEGRATIONS: false,
      },
    });
    const result = await service.createClient(agencyContext(), {
      code: 'NORTHSTAR',
      display_name: 'Northstar Motors',
      legal_name: 'Northstar Motors Private Limited',
      timezone: 'Asia/Kolkata',
    });
    const [leadFlag] = await database.db
      .select()
      .from(schema.clientModuleFlags)
      .where(
        and(
          eq(schema.clientModuleFlags.clientOrganizationId, result.client_organization.id),
          eq(schema.clientModuleFlags.module, 'LEADS'),
        ),
      );
    assert.equal(leadFlag?.enabled, true);
    const [audit] = await database.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, 'CLIENT_CREATED'));
    assert.equal(audit?.newSummary?.status, 'PENDING');
  });

  it('does not allow removal of an active client’s final Client Admin', async () => {
    database = await createMigratedPgliteSetup();
    const service = new AdministrationService({ db: database.db } as unknown as DatabaseConnection);
    await assert.rejects(
      () =>
        service.setMembershipStatus(clientContext(), adminMembershipId, {
          status: 'ENDED',
          reason: 'Attempt to remove final administrator.',
        }),
      /At least one active Client Admin/,
    );
    const [membership] = await database.db
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.id, adminMembershipId));
    assert.equal(membership?.status, 'ACTIVE');
  });
  it('returns and audits the actual changed role and tenant-scoped branch/team scopes', async () => {
    database = await createMigratedPgliteSetup();
    const service = new AdministrationService({ db: database.db } as unknown as DatabaseConnection);
    const branchId = '30000000-0000-4000-8000-000000000001';
    const teamId = '40000000-0000-4000-8000-000000000001';
    const departmentId = '35000000-0000-4000-8000-000000000001';
    const secondAdminId = '50000000-0000-4000-8000-000000000002';
    const secondMembershipId = '60000000-0000-4000-8000-000000000002';
    const [clientAdminRole] = await database.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.code, 'CLIENT_ADMIN'));
    if (!clientAdminRole) throw new Error('The canonical Client Admin role was not installed.');
    await database.db.insert(schema.users).values({
      id: secondAdminId,
      displayName: 'Second Client Admin',
      primaryEmailNormalized: 'second.admin@northstar.test',
      status: 'ACTIVE',
    });
    await database.db.insert(schema.memberships).values({
      id: secondMembershipId,
      userId: secondAdminId,
      contextType: 'CLIENT',
      clientOrganizationId: clientId,
      roleId: clientAdminRole.id,
      status: 'ACTIVE',
      branchScopeMode: 'ALL',
      teamScopeMode: 'ALL',
      assignmentScope: 'ALL',
    });
    await database.db.insert(schema.branches).values({
      id: branchId,
      clientOrganizationId: clientId,
      code: 'MAIN',
      name: 'Main showroom',
      timezone: 'Asia/Kolkata',
    });
    await database.db.insert(schema.departments).values({
      id: departmentId,
      clientOrganizationId: clientId,
      branchId,
      code: 'SALES',
      name: 'Sales',
    });
    await database.db.insert(schema.teams).values({
      id: teamId,
      clientOrganizationId: clientId,
      branchId,
      departmentId,
      code: 'SALES',
      name: 'Sales',
    });
    const result = await service.updateMembership(clientContext(), adminMembershipId, {
      assignment_scope: 'OWNED_OR_ASSIGNED',
      branch_ids: [branchId],
      branch_scope_mode: 'SELECTED',
      department_ids: [departmentId],
      department_scope_mode: 'SELECTED',
      job_title: 'Showroom Manager',
      role_code: 'SALES_MANAGER',
      team_ids: [teamId],
      team_scope_mode: 'SELECTED',
    });
    assert.equal(result.user.role_code, 'SALES_MANAGER');
    assert.deepEqual(result.user.branch_ids, [branchId]);
    assert.deepEqual(result.user.team_ids, [teamId]);
    const [audit] = await database.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, 'MEMBERSHIP_ROLE_OR_SCOPE_UPDATED'));
    assert.equal(audit?.newSummary?.role_code, 'SALES_MANAGER');
    assert.deepEqual(audit?.newSummary?.branch_scope_mode, 'SELECTED');
    assert.deepEqual(audit?.newSummary?.team_scope_mode, 'SELECTED');
    const membership = await service.membership(clientContext(), adminMembershipId);
    assert.deepEqual(membership.user.branch_ids, [branchId]);
    assert.deepEqual(membership.user.team_ids, [teamId]);
  });

  it('maintains canonical team membership, manager history and an acyclic scoped hierarchy', async () => {
    database = await createMigratedPgliteSetup();
    const service = new AdministrationService({ db: database.db } as unknown as DatabaseConnection);
    const branchId = '31000000-0000-4000-8000-000000000001';
    const firstManagerId = '61000000-0000-4000-8000-000000000001';
    const secondManagerId = '61000000-0000-4000-8000-000000000002';
    const salespersonId = '61000000-0000-4000-8000-000000000003';
    const outsideMemberId = '61000000-0000-4000-8000-000000000004';
    await database.db.insert(schema.branches).values({
      id: branchId,
      clientOrganizationId: clientId,
      code: 'HQ',
      name: 'HQ Showroom',
      timezone: 'Asia/Kolkata',
    });
    await service.createDepartment(clientContext(), {
      branch_id: branchId,
      code: 'NEW_CAR_SALES',
      name: 'New Car Sales',
    });
    const [department] = await database.db
      .select()
      .from(schema.departments)
      .where(eq(schema.departments.code, 'NEW_CAR_SALES'));
    assert.ok(department);
    assert.equal(department.branchId, branchId);
    const { team } = await service.createTeam(clientContext(), {
      branch_id: branchId,
      department_id: department.id,
      code: 'SALES_A',
      name: 'Sales A',
    });
    await service.createTeam(clientContext(), {
      branch_id: branchId,
      department_id: department.id,
      code: 'SALES_B',
      name: 'Sales B',
    });
    const [otherTeam] = await database.db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.code, 'SALES_B'));
    assert.ok(otherTeam);

    const [teamManagerRole] = await database.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.code, 'TEAM_MANAGER'));
    const [salespersonRole] = await database.db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.code, 'SALESPERSON'));
    assert.ok(teamManagerRole);
    assert.ok(salespersonRole);
    const memberships = [
      { id: firstManagerId, roleId: teamManagerRole.id, suffix: 'manager.one' },
      { id: secondManagerId, roleId: teamManagerRole.id, suffix: 'manager.two' },
      { id: salespersonId, roleId: salespersonRole.id, suffix: 'salesperson' },
      { id: outsideMemberId, roleId: salespersonRole.id, suffix: 'outside' },
    ];
    for (const [index, membership] of memberships.entries()) {
      const userId = `51000000-0000-4000-8000-00000000000${index + 2}`;
      await database.db.insert(schema.users).values({
        id: userId,
        displayName: membership.suffix,
        primaryEmailNormalized: `${membership.suffix}@northstar.test`,
        status: 'ACTIVE',
      });
      await database.db.insert(schema.memberships).values({
        id: membership.id,
        userId,
        contextType: 'CLIENT',
        clientOrganizationId: clientId,
        roleId: membership.roleId,
        status: 'ACTIVE',
        branchScopeMode: 'SELECTED',
        departmentScopeMode: 'SELECTED',
        teamScopeMode: 'SELECTED',
        assignmentScope: 'TEAM',
      });
      await database.db.insert(schema.membershipBranchScopes).values({
        clientOrganizationId: clientId,
        membershipId: membership.id,
        branchId,
      });
      await database.db.insert(schema.membershipDepartmentScopes).values({
        clientOrganizationId: clientId,
        membershipId: membership.id,
        branchId,
        departmentId: department.id,
      });
    }
    await service.assignTeamMember(clientContext(), team.id, {
      membership_id: salespersonId,
      reason: 'Primary sales team placement.',
    });
    await service.assignTeamMember(clientContext(), otherTeam.id, {
      membership_id: outsideMemberId,
      reason: 'Separate team placement.',
    });
    await service.replaceTeamManager(clientContext(), team.id, {
      manager_membership_id: firstManagerId,
      reason: 'Initial Team Manager assignment.',
    });
    await service.setReportingManager(clientContext(), salespersonId, {
      manager_membership_id: firstManagerId,
      reason: 'Sales reporting line.',
    });
    await assert.rejects(
      () =>
        service.setReportingManager(clientContext(), salespersonId, {
          manager_membership_id: salespersonId,
          reason: 'Self-reporting must fail.',
        }),
      /itself/,
    );
    await assert.rejects(
      () =>
        service.setReportingManager(clientContext(), firstManagerId, {
          manager_membership_id: salespersonId,
          reason: 'This would create a cycle.',
        }),
      /cycle/,
    );
    await service.replaceTeamManager(clientContext(), team.id, {
      manager_membership_id: secondManagerId,
      reason: 'Planned manager handover.',
    });
    const managerHistory = await database.db
      .select()
      .from(schema.teamManagerAssignments)
      .where(eq(schema.teamManagerAssignments.teamId, team.id));
    assert.equal(managerHistory.length, 2);
    assert.equal(managerHistory.filter((row) => row.endedAt === null).length, 1);

    const scopedManager = {
      ...clientContext(),
      branchIds: new Set([branchId]),
      branchScopeMode: 'SELECTED' as const,
      departmentIds: new Set([department.id]),
      departmentScopeMode: 'SELECTED' as const,
      roleCode: 'SALES_MANAGER' as const,
      teamIds: new Set([team.id]),
      teamScopeMode: 'SELECTED' as const,
    };
    await assert.rejects(
      () =>
        service.setReportingManager(scopedManager, outsideMemberId, {
          manager_membership_id: secondManagerId,
          reason: 'Unauthorized cross-team change.',
        }),
      /outside your management scope/,
    );
    const hierarchy = await service.hierarchy(scopedManager);
    assert.deepEqual(
      hierarchy.teams.map((row) => row.id),
      [team.id],
    );
    assert.equal(hierarchy.team_manager_assignments[0]?.manager_membership_id, secondManagerId);
  });
});

async function createMigratedPgliteSetup(): Promise<MigratedPGliteTestDatabase> {
  const database = await createMigratedPGliteTestDatabase();
  await database.db
    .insert(schema.agencies)
    .values({ id: agencyId, code: 'GDM', legalName: 'Go Digital', displayName: 'Go Digital' });
  await database.db.insert(schema.clientOrganizations).values({
    id: clientId,
    agencyId,
    code: 'NORTHSTAR',
    legalName: 'Northstar Motors Private Limited',
    displayName: 'Northstar Motors',
    status: 'ACTIVE',
    timezone: 'Asia/Kolkata',
  });
  await database.db.insert(schema.users).values({
    id: adminUserId,
    displayName: 'Client Admin',
    primaryEmailNormalized: 'client.admin@northstar.test',
    status: 'ACTIVE',
  });
  const [role] = await database.db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.code, 'CLIENT_ADMIN'));
  if (!role) throw new Error('The canonical Client Admin role was not installed.');
  await database.db.insert(schema.memberships).values({
    id: adminMembershipId,
    userId: adminUserId,
    contextType: 'CLIENT',
    clientOrganizationId: clientId,
    roleId: role.id,
    status: 'ACTIVE',
    branchScopeMode: 'ALL',
    departmentScopeMode: 'ALL',
    teamScopeMode: 'ALL',
    assignmentScope: 'ALL',
  });
  return database;
}
