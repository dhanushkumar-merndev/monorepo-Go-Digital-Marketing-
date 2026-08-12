import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { schema, type DatabaseConnection } from '@gdm/database';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { and, count, eq } from 'drizzle-orm';

import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import { LeadsService } from '../src/leads/leads.service.js';

const agencyId = '10000000-0000-4000-8000-000000000091';
const tenantA = '20000000-0000-4000-8000-000000000091';
const tenantB = '20000000-0000-4000-8000-000000000092';
const branchA = '21000000-0000-4000-8000-000000000091';
const branchB = '21000000-0000-4000-8000-000000000092';
const departmentA = '21500000-0000-4000-8000-000000000091';
const teamA = '22000000-0000-4000-8000-000000000091';
const roleId = '30000000-0000-4000-8000-000000000003';
const managerUser = '50000000-0000-4000-8000-000000000091';
const activeUser = '50000000-0000-4000-8000-000000000092';
const inactiveUser = '50000000-0000-4000-8000-000000000093';
const otherUser = '50000000-0000-4000-8000-000000000094';
const managerMember = '60000000-0000-4000-8000-000000000091';
const activeMember = '60000000-0000-4000-8000-000000000092';
const inactiveMember = '60000000-0000-4000-8000-000000000093';
const otherMember = '60000000-0000-4000-8000-000000000094';
const queueId = '81000000-0000-4000-8000-000000000091';

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    assignmentScope: 'ALL',
    branchIds: new Set([branchA]),
    branchScopeMode: 'ALL',
    departmentIds: new Set([departmentA]),
    departmentScopeMode: 'ALL',
    clientOrganizationId: tenantA,
    membershipId: managerMember,
    managedTeamIds: new Set<string>(),
    permissionCodes: new Set(),
    roleCode: 'MANAGER',
    sessionId: '90000000-0000-4000-8000-000000000091',
    teamIds: new Set([teamA]),
    teamScopeMode: 'ALL',
    userId: managerUser,
    ...overrides,
  };
}

describe('Phase 3 lead service integration', () => {
  let database: MigratedPGliteTestDatabase | undefined;
  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it('enforces idempotency, assignment eligibility, scoped reads, lifecycle, reassignment audit and SLA', async () => {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    await db.insert(schema.agencies).values({
      id: agencyId,
      code: 'LEAD_TEST',
      displayName: 'Lead Test',
      legalName: 'Lead Test Private Limited',
    });
    await db.insert(schema.clientOrganizations).values([
      {
        agencyId,
        code: 'A',
        displayName: 'Tenant A',
        id: tenantA,
        legalName: 'Tenant A Motors',
        status: 'ACTIVE',
      },
      {
        agencyId,
        code: 'B',
        displayName: 'Tenant B',
        id: tenantB,
        legalName: 'Tenant B Motors',
        status: 'ACTIVE',
      },
    ]);
    await db.insert(schema.branches).values([
      { clientOrganizationId: tenantA, code: 'A1', id: branchA, name: 'A Main' },
      { clientOrganizationId: tenantB, code: 'B1', id: branchB, name: 'B Main' },
    ]);
    await db.insert(schema.departments).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      code: 'SALES',
      id: departmentA,
      name: 'Sales',
    });
    await db.insert(schema.teams).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      code: 'SALES',
      departmentId: departmentA,
      id: teamA,
      name: 'Sales',
    });
    await db.insert(schema.users).values([
      {
        displayName: 'Manager',
        id: managerUser,
        primaryEmailNormalized: 'manager@test.invalid',
        status: 'ACTIVE',
      },
      {
        displayName: 'Active Agent',
        id: activeUser,
        primaryEmailNormalized: 'active@test.invalid',
        status: 'ACTIVE',
      },
      {
        displayName: 'Inactive Agent',
        id: inactiveUser,
        primaryEmailNormalized: 'inactive@test.invalid',
        status: 'SUSPENDED',
      },
      {
        displayName: 'Other Agent',
        id: otherUser,
        primaryEmailNormalized: 'other@test.invalid',
        status: 'ACTIVE',
      },
    ]);
    await db.insert(schema.memberships).values([
      {
        assignmentScope: 'ALL',
        branchScopeMode: 'ALL',
        departmentScopeMode: 'ALL',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        id: managerMember,
        roleId,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: managerUser,
      },
      {
        assignmentScope: 'ASSIGNED',
        branchScopeMode: 'ALL',
        departmentScopeMode: 'ALL',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        id: activeMember,
        roleId,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: activeUser,
      },
      {
        assignmentScope: 'ASSIGNED',
        branchScopeMode: 'ALL',
        departmentScopeMode: 'ALL',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        id: inactiveMember,
        roleId,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: inactiveUser,
      },
      {
        assignmentScope: 'ASSIGNED',
        branchScopeMode: 'ALL',
        departmentScopeMode: 'ALL',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        id: otherMember,
        roleId,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: otherUser,
      },
    ]);
    await db.insert(schema.teamMemberships).values([
      {
        branchId: branchA,
        clientOrganizationId: tenantA,
        departmentId: departmentA,
        membershipId: activeMember,
        reason: 'Canonical Phase 2 team placement.',
        teamId: teamA,
      },
      {
        branchId: branchA,
        clientOrganizationId: tenantA,
        departmentId: departmentA,
        membershipId: inactiveMember,
        reason: 'Canonical Phase 2 team placement.',
        teamId: teamA,
      },
    ]);
    for (let day = 0; day < 7; day += 1)
      await db.insert(schema.branchWorkingHours).values({
        branchId: branchA,
        clientOrganizationId: tenantA,
        closesAt: '23:59:00',
        dayOfWeek: day,
        isClosed: false,
        opensAt: '00:01:00',
      });
    await db.insert(schema.leadSettings).values({
      clientOrganizationId: tenantA,
      firstActionSlaMinutes: 15,
      warningBeforeMinutes: 5,
    });
    await db.insert(schema.assignmentQueues).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      code: 'INBOUND',
      id: queueId,
      name: 'Inbound',
      strategy: 'ROUND_ROBIN',
      teamId: teamA,
    });
    await db.insert(schema.assignmentQueueMembers).values([
      { clientOrganizationId: tenantA, membershipId: inactiveMember, queueId },
      {
        clientOrganizationId: tenantA,
        lastAssignedAt: new Date('2020-01-01T00:00:00.000Z'),
        membershipId: activeMember,
        queueId,
      },
      { clientOrganizationId: tenantA, membershipId: otherMember, queueId },
    ]);
    const service = new LeadsService(
      { db } as unknown as DatabaseConnection,
      { phoneLookupPepper: 'integration-test-phone-pepper', publicRateLimitWindowSeconds: 60 },
      new AuthorizationPolicy(),
    );
    const body = {
      assignment_queue_id: queueId,
      branch_id: branchA,
      consent: {
        evidence: 'Recorded test consent',
        granted: true,
        notice_version: 'v1',
        purpose: 'LEAD_RESPONSE' as const,
      },
      name: 'A Customer',
      phone: '9876543210',
      source: 'WEBSITE' as const,
      vehicle_interest: 'Model X',
    };
    const created = (await service.createManual(
      context(),
      body,
      'same-event',
      'correlation-a',
    )) as {
      lead: { id: string; current_process_owner_id: string; version: number };
      replayed: boolean;
    };
    const replay = (await service.createManual(context(), body, 'same-event', 'correlation-b')) as {
      replayed: boolean;
    };
    assert.equal(replay.replayed, true);
    const [leadCount] = await db
      .select({ value: count() })
      .from(schema.leadOpportunities)
      .where(eq(schema.leadOpportunities.clientOrganizationId, tenantA));
    assert.equal(leadCount?.value, 1);
    assert.equal(
      created.lead.current_process_owner_id,
      activeUser,
      'inactive and non-team queue members must be skipped',
    );

    const teamManager = context({
      assignmentScope: 'TEAM',
      managedTeamIds: new Set([teamA]),
      roleCode: 'TEAM_MANAGER',
    });
    assert.equal(
      (await service.list(teamManager, { limit: 50, page: 1, sla: 'ALL' })).leads.length,
      1,
    );
    assert.equal(
      (
        await service.list(
          context({ assignmentScope: 'TEAM', managedTeamIds: new Set(), roleCode: 'TEAM_MANAGER' }),
          { limit: 50, page: 1, sla: 'ALL' },
        )
      ).leads.length,
      0,
      'Team Manager must not inherit whole-branch lead visibility',
    );

    const salesperson = context({
      assignmentScope: 'ASSIGNED',
      membershipId: activeMember,
      roleCode: 'SALESPERSON',
      userId: activeUser,
    });
    assert.equal(
      (await service.list(salesperson, { limit: 50, page: 1, sla: 'ALL' })).leads.length,
      1,
    );
    const unassignedSalesperson = context({
      assignmentScope: 'ASSIGNED',
      membershipId: otherMember,
      roleCode: 'SALESPERSON',
      userId: otherUser,
    });
    assert.equal(
      (await service.list(unassignedSalesperson, { limit: 50, page: 1, sla: 'ALL' })).leads.length,
      0,
    );
    await assert.rejects(() =>
      service.detail(
        context({ clientOrganizationId: tenantB, branchIds: new Set([branchB]) }),
        created.lead.id,
      ),
    );

    const rejectedLead = (await service.createManual(
      context(),
      body,
      'repeat-opportunity-rejected',
      'correlation-repeat-a',
    )) as unknown as { lead: { id: string; version: number } };
    const rejected = (await service.transition(
      salesperson,
      rejectedLead.lead.id,
      {
        expected_version: rejectedLead.lead.version,
        note: 'Number belongs to an unrelated enquiry.',
        rejection_reason: 'WRONG_ENQUIRY',
        to_status: 'REJECTED',
      },
      'reject-command',
      'correlation-reject',
    )) as { version: number };
    assert.equal(
      (
        await service.list(context(), {
          history_status: 'REJECTED',
          limit: 50,
          page: 1,
          sla: 'ALL',
        })
      ).leads.length,
      1,
    );
    await service.transition(
      salesperson,
      rejectedLead.lead.id,
      {
        expected_version: rejected.version,
        next_action_at: '2026-08-09T10:00:00+05:30',
        note: 'Customer clarified this is a valid repeat enquiry.',
        reopen_reason: 'New enquiry confirmed by customer.',
        to_status: 'REOPENED',
      },
      'reopen-command',
      'correlation-reopen',
    );
    assert.equal((await service.detail(salesperson, rejectedLead.lead.id)).lead.source, 'WEBSITE');

    const lostLead = (await service.createManual(
      context(),
      body,
      'repeat-opportunity-lost',
      'correlation-repeat-b',
    )) as unknown as { lead: { id: string; version: number } };
    const qualifiedLostLead = (await service.transition(
      salesperson,
      lostLead.lead.id,
      {
        expected_version: lostLead.lead.version,
        next_action_at: '2026-08-09T11:00:00+05:30',
        note: 'Customer accepted qualification.',
        to_status: 'ACCEPTED',
      },
      'accept-lost-command',
      'correlation-lost-a',
    )) as { version: number };
    await service.transition(
      salesperson,
      lostLead.lead.id,
      {
        expected_version: qualifiedLostLead.version,
        lost_reason: 'COMPETITOR_PURCHASE',
        note: 'Customer confirmed another purchase.',
        to_status: 'LOST',
      },
      'lost-command',
      'correlation-lost-b',
    );
    assert.equal(
      (
        await service.list(context(), {
          history_status: 'LOST',
          limit: 50,
          page: 1,
          sla: 'ALL',
        })
      ).leads.length,
      1,
    );

    const accepted = (await service.transition(
      salesperson,
      created.lead.id,
      {
        expected_version: created.lead.version,
        next_action_at: '2026-08-08T10:00:00+05:30',
        note: 'Customer accepted qualification.',
        to_status: 'ACCEPTED',
      },
      'accept-command',
      'correlation-c',
    )) as { version: number };
    await assert.rejects(() =>
      service.transition(
        salesperson,
        created.lead.id,
        {
          expected_version: accepted.version,
          note: 'Invalid shortcut.',
          rejection_reason: 'SPAM',
          to_status: 'REJECTED',
        },
        'invalid-command',
        'correlation-d',
      ),
    );
    const followUpInput = {
      channel: 'CALL' as const,
      due_at: '2026-08-10T10:00:00+05:30',
      note: 'Confirm preferred showroom slot.',
      priority: 'NORMAL' as const,
      purpose: 'Showroom visit follow-up',
    };
    await service.addFollowUp(
      salesperson,
      created.lead.id,
      followUpInput,
      'offline-follow-up-command',
      'correlation-follow-up-a',
    );
    await service.addFollowUp(
      salesperson,
      created.lead.id,
      followUpInput,
      'offline-follow-up-command',
      'correlation-follow-up-b',
    );
    const [followUpCount] = await db
      .select({ value: count() })
      .from(schema.leadFollowUps)
      .where(eq(schema.leadFollowUps.leadId, created.lead.id));
    assert.equal(followUpCount?.value, 1, 'offline replay must not duplicate a follow-up');
    await db.insert(schema.teamMemberships).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      departmentId: departmentA,
      membershipId: otherMember,
      reason: 'Eligible reassignment into the canonical team.',
      teamId: teamA,
    });
    await service.assign(
      context(),
      created.lead.id,
      {
        expected_version: accepted.version,
        membership_id: otherMember,
        reason: 'Territory coverage changed.',
        transfer_relationship_owner: false,
      },
      'correlation-e',
    );
    const [assignmentAudit] = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.clientOrganizationId, tenantA),
          eq(schema.auditEvents.action, 'LEAD_REASSIGNED'),
        ),
      );
    assert.equal(assignmentAudit?.reason, 'Territory coverage changed.');

    await db
      .update(schema.slaTimers)
      .set({
        dueAt: new Date('2020-01-01T00:00:00Z'),
        state: 'OPEN',
        warningAt: new Date('2019-12-31T23:55:00Z'),
      })
      .where(eq(schema.slaTimers.leadId, created.lead.id));
    await db
      .update(schema.leadOpportunities)
      .set({ firstActionAt: null, slaState: 'OPEN' })
      .where(eq(schema.leadOpportunities.id, created.lead.id));
    const sla = await service.reconcileSla(
      context(),
      new Date('2020-01-01T00:01:00Z'),
      'correlation-f',
    );
    assert.equal(sla.breached, 1);
    const [escalation] = await db
      .select()
      .from(schema.slaEscalations)
      .where(eq(schema.slaEscalations.leadId, created.lead.id));
    assert.equal(escalation?.level, 1);
  });
});
