import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { integrationConnectionRequestSchema } from '@gdm/contracts';
import { schema, type DatabaseConnection } from '@gdm/database';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { eq } from 'drizzle-orm';

import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import { IntegrationsService } from '../src/integrations/integrations.service.js';
import type { ObjectStorage } from '../src/infrastructure/storage/object-storage.port.js';
import { ReportsService } from '../src/reports/reports.service.js';

const agencyId = 'a0000000-0000-4000-8000-000000000014';
const tenantId = 'b0000000-0000-4000-8000-000000000014';
const branchId = 'c0000000-0000-4000-8000-000000000014';
const departmentA = 'd0000000-0000-4000-8000-000000000014';
const departmentB = 'd0000000-0000-4000-8000-000000000015';
const teamA = 'e0000000-0000-4000-8000-000000000014';
const teamB = 'e0000000-0000-4000-8000-000000000015';
const managerUser = '10000000-0000-4000-8000-000000000014';
const agentAUser = '10000000-0000-4000-8000-000000000015';
const agentBUser = '10000000-0000-4000-8000-000000000016';
const managerMembership = '20000000-0000-4000-8000-000000000014';
const agentAMembership = '20000000-0000-4000-8000-000000000015';
const agentBMembership = '20000000-0000-4000-8000-000000000016';
const contactA = '30000000-0000-4000-8000-000000000014';
const contactB = '30000000-0000-4000-8000-000000000015';
const leadA = '40000000-0000-4000-8000-000000000014';
const leadB = '40000000-0000-4000-8000-000000000015';
const telephonyConnectionId = '50000000-0000-4000-8000-000000000014';
const callA = '60000000-0000-4000-8000-000000000014';
const callB = '60000000-0000-4000-8000-000000000015';
const recordingA = '70000000-0000-4000-8000-000000000014';
const creativeId = '80000000-0000-4000-8000-000000000014';

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    assignmentScope: 'ALL',
    branchIds: new Set([branchId]),
    branchScopeMode: 'SELECTED',
    clientOrganizationId: tenantId,
    departmentIds: new Set(),
    departmentScopeMode: 'ALL',
    managedTeamIds: new Set(),
    membershipId: managerMembership,
    permissionCodes: new Set([
      'reports.read',
      'reports.export',
      'audit.events.read',
      'integrations.read',
      'integrations.manage',
    ]),
    roleCode: 'MANAGER',
    sessionId: '90000000-0000-4000-8000-000000000014',
    teamIds: new Set(),
    teamScopeMode: 'ALL',
    userId: managerUser,
    ...overrides,
  };
}

describe('Phase 12/13 release-audit regressions', () => {
  let database: MigratedPGliteTestDatabase;
  let integrations: IntegrationsService;
  let reports: ReportsService;
  let objects: Map<string, Uint8Array>;

  before(async () => {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    objects = new Map();
    const storage: ObjectStorage = {
      createDownloadUrl: async () => ({
        expiresAt: '2026-08-09T12:05:00.000Z',
        method: 'GET',
        url: 'https://private.example.test/export',
      }),
      createUploadUrl: async () => ({
        expiresAt: '2026-08-09T12:05:00.000Z',
        method: 'PUT',
        url: 'https://private.example.test/upload',
      }),
      putPrivateObject: async (request) => {
        objects.set(request.key, request.body);
      },
      stat: async () => undefined,
    };
    const connection = { db } as unknown as DatabaseConnection;
    integrations = new IntegrationsService(connection);
    reports = new ReportsService(connection, new AuthorizationPolicy(), storage);

    await db.insert(schema.agencies).values({
      code: 'PHASE_14_AUDIT',
      displayName: 'Phase 14 Audit',
      id: agencyId,
      legalName: 'Phase 14 Audit Private Limited',
    });
    await db.insert(schema.clientOrganizations).values({
      agencyId,
      code: 'PHASE_14_CLIENT',
      displayName: 'Phase 14 Client',
      id: tenantId,
      legalName: 'Phase 14 Client Motors',
      status: 'ACTIVE',
    });
    await db.insert(schema.branches).values({
      clientOrganizationId: tenantId,
      code: 'MAIN',
      id: branchId,
      name: 'Main',
    });
    await db.insert(schema.departments).values([
      {
        branchId,
        clientOrganizationId: tenantId,
        code: 'SALES_A',
        id: departmentA,
        name: 'Sales A',
      },
      {
        branchId,
        clientOrganizationId: tenantId,
        code: 'SALES_B',
        id: departmentB,
        name: 'Sales B',
      },
    ]);
    await db.insert(schema.teams).values([
      {
        branchId,
        clientOrganizationId: tenantId,
        code: 'TEAM_A',
        departmentId: departmentA,
        id: teamA,
        name: 'Team A',
      },
      {
        branchId,
        clientOrganizationId: tenantId,
        code: 'TEAM_B',
        departmentId: departmentB,
        id: teamB,
        name: 'Team B',
      },
    ]);
    await db.insert(schema.users).values([
      {
        displayName: 'Manager',
        id: managerUser,
        primaryEmailNormalized: 'manager@phase14.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Agent A',
        id: agentAUser,
        primaryEmailNormalized: 'agent-a@phase14.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Agent B',
        id: agentBUser,
        primaryEmailNormalized: 'agent-b@phase14.test',
        status: 'ACTIVE',
      },
    ]);
    const [managerRole] = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, 'MANAGER'))
      .limit(1);
    const [salesRole] = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, 'SALESPERSON'))
      .limit(1);
    assert.ok(managerRole && salesRole);
    await db.insert(schema.memberships).values([
      {
        assignmentScope: 'ALL',
        branchScopeMode: 'SELECTED',
        clientOrganizationId: tenantId,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: managerMembership,
        roleId: managerRole.id,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: managerUser,
      },
      {
        assignmentScope: 'ASSIGNED',
        branchScopeMode: 'SELECTED',
        clientOrganizationId: tenantId,
        contextType: 'CLIENT',
        departmentScopeMode: 'SELECTED',
        id: agentAMembership,
        roleId: salesRole.id,
        status: 'ACTIVE',
        teamScopeMode: 'SELECTED',
        userId: agentAUser,
      },
      {
        assignmentScope: 'ASSIGNED',
        branchScopeMode: 'SELECTED',
        clientOrganizationId: tenantId,
        contextType: 'CLIENT',
        departmentScopeMode: 'SELECTED',
        id: agentBMembership,
        roleId: salesRole.id,
        status: 'ACTIVE',
        teamScopeMode: 'SELECTED',
        userId: agentBUser,
      },
    ]);
    await db.insert(schema.teamMemberships).values([
      {
        branchId,
        clientOrganizationId: tenantId,
        departmentId: departmentA,
        membershipId: agentAMembership,
        reason: 'Phase 14 scope fixture',
        teamId: teamA,
      },
      {
        branchId,
        clientOrganizationId: tenantId,
        departmentId: departmentB,
        membershipId: agentBMembership,
        reason: 'Phase 14 scope fixture',
        teamId: teamB,
      },
    ]);
    await db.insert(schema.contacts).values([
      {
        clientOrganizationId: tenantId,
        displayName: 'Customer A',
        id: contactA,
        primaryPhoneE164: '+919900000014',
        primaryPhoneLookupHash: 'a'.repeat(64),
      },
      {
        clientOrganizationId: tenantId,
        displayName: 'Customer B',
        id: contactB,
        primaryPhoneE164: '+919900000015',
        primaryPhoneLookupHash: 'b'.repeat(64),
      },
    ]);
    await db.insert(schema.leadOpportunities).values([
      {
        branchId,
        capturedAt: new Date('2026-08-09T06:00:00.000Z'),
        clientOrganizationId: tenantId,
        contactId: contactA,
        currentProcessOwnerId: agentAUser,
        currentProcessOwnerMembershipId: agentAMembership,
        entryMethod: 'MANUAL',
        id: leadA,
        relationshipOwnerId: agentAUser,
        relationshipOwnerMembershipId: agentAMembership,
        slaDueAt: new Date('2026-08-09T06:15:00.000Z'),
        slaWarningAt: new Date('2026-08-09T06:10:00.000Z'),
        source: 'WEBSITE',
        status: 'NEW',
        vehicleInterest: 'Model A',
      },
      {
        branchId,
        capturedAt: new Date('2026-08-09T07:00:00.000Z'),
        clientOrganizationId: tenantId,
        contactId: contactB,
        currentProcessOwnerId: agentBUser,
        currentProcessOwnerMembershipId: agentBMembership,
        entryMethod: 'MANUAL',
        id: leadB,
        relationshipOwnerId: agentBUser,
        relationshipOwnerMembershipId: agentBMembership,
        slaDueAt: new Date('2026-08-09T07:15:00.000Z'),
        slaWarningAt: new Date('2026-08-09T07:10:00.000Z'),
        source: 'WEBSITE',
        status: 'ACCEPTED',
        vehicleInterest: 'Model B',
      },
    ]);
  });

  after(async () => {
    await database.close();
  });

  it('accepts only provider-specific public settings and never echoes stored settings', async () => {
    assert.equal(
      integrationConnectionRequestSchema.safeParse({
        display_name: 'Meta leads',
        provider: 'META_LEADS',
        settings: { access_token: 'must-never-be-stored' },
      }).success,
      false,
    );
    await assert.rejects(() =>
      integrations.connect(
        context(),
        {
          display_name: 'Meta leads',
          provider: 'META_LEADS',
          settings: { access_token: 'must-never-be-stored' },
        } as never,
        'unsafe-settings',
      ),
    );
    const result = await integrations.connect(
      context(),
      {
        display_name: 'Meta leads',
        provider: 'META_LEADS',
        settings: { business_account_id: 'business-14', page_id: 'page-14' },
      },
      'safe-settings',
    );
    assert.equal('settings' in result.connection, false);
    assert.equal('credentialCiphertext' in result.connection, false);
    const [stored] = await database.db
      .select({ settings: schema.integrationConnections.settings })
      .from(schema.integrationConnections);
    assert.deepEqual(stored?.settings, {
      business_account_id: 'business-14',
      page_id: 'page-14',
    });
  });

  it('requires the transcript recording to belong to the exact call and hides creative keys', async () => {
    await database.db.insert(schema.telephonyProviderConnections).values({
      clientOrganizationId: tenantId,
      connectionKey: 'phase14-telephony',
      displayName: 'Phase 14 telephony',
      id: telephonyConnectionId,
      provider: 'DEVELOPMENT',
      status: 'ACTIVE',
    });
    await database.db.insert(schema.calls).values([
      {
        clientOrganizationId: tenantId,
        connectionId: telephonyConnectionId,
        contactId: contactA,
        direction: 'OUTBOUND',
        id: callA,
        leadId: leadA,
        origin: 'PROVIDER',
        outcomeRequirement: 'NOT_REQUIRED',
        provider: 'DEVELOPMENT',
        status: 'REQUESTED',
      },
      {
        clientOrganizationId: tenantId,
        connectionId: telephonyConnectionId,
        contactId: contactB,
        direction: 'OUTBOUND',
        id: callB,
        leadId: leadB,
        origin: 'PROVIDER',
        outcomeRequirement: 'NOT_REQUIRED',
        provider: 'DEVELOPMENT',
        status: 'REQUESTED',
      },
    ]);
    await database.db.insert(schema.callRecordings).values({
      callId: callA,
      clientOrganizationId: tenantId,
      id: recordingA,
      source: 'PROVIDER',
    });
    await assert.rejects(() =>
      integrations.createTranscriptSuggestion(
        context(),
        {
          call_id: callB,
          recording_id: recordingA,
          suggestions: [],
          summary: 'Summary',
          transcript: 'Transcript',
        },
        'wrong-call',
      ),
    );

    await database.db.insert(schema.generatedCreativeAssets).values({
      brandProfile: 'Brand',
      brandTemplate: 'Template',
      brief: 'A valid private creative brief.',
      clientOrganizationId: tenantId,
      id: creativeId,
      objectKey: `private/${tenantId}/creative.png`,
      provider: 'AI_IMAGE',
      requestedByMembershipId: managerMembership,
      status: 'REVIEW_PENDING',
    });
    const listed = await integrations.creativeRequests(context());
    assert.equal('objectKey' in (listed.assets[0] ?? {}), false);
    const reviewed = await integrations.reviewCreative(
      context(),
      creativeId,
      { approved: true, reason: 'Human approval recorded.' },
      'creative-review',
    );
    assert.equal('objectKey' in reviewed.asset, false);
  });

  it('uses DST-safe local-day bounds and denies Team Managers tenant-wide audit events', async () => {
    const spring = await reports.dashboard(context(), {
      from: '2026-03-08',
      timezone: 'America/New_York',
      to: '2026-03-08',
    });
    assert.equal(spring.range.start_at, '2026-03-08T05:00:00.000Z');
    assert.equal(spring.range.end_at, '2026-03-09T04:00:00.000Z');
    const teamManager = context({
      assignmentScope: 'TEAM',
      departmentIds: new Set([departmentA]),
      departmentScopeMode: 'SELECTED',
      managedTeamIds: new Set([teamA]),
      roleCode: 'TEAM_MANAGER',
    });
    const dashboard = await reports.dashboard(teamManager, {
      from: '2026-08-09',
      timezone: 'Asia/Kolkata',
      to: '2026-08-09',
    });
    assert.equal(dashboard.metrics.funnel.leads, 1);
    assert.deepEqual(dashboard.metrics.funnel.by_status, { NEW: 1 });
    await assert.rejects(() =>
      reports.auditEvents(teamManager, {
        from: '2026-08-09',
        limit: 100,
        timezone: 'Asia/Kolkata',
        to: '2026-08-09',
      }),
    );
    await assert.rejects(() =>
      reports.createExport(
        teamManager,
        {
          filters: { from: '2026-08-09', timezone: 'Asia/Kolkata', to: '2026-08-09' },
          format: 'CSV',
          kind: 'AUDIT_EVENTS',
        },
        'team-audit-export',
      ),
    );
  });

  it('preserves export scope, writes audit rows, neutralizes CSV formulas and hides object keys', async () => {
    const teamManager = context({
      assignmentScope: 'TEAM',
      departmentIds: new Set([departmentA]),
      departmentScopeMode: 'SELECTED',
      managedTeamIds: new Set([teamA]),
      roleCode: 'TEAM_MANAGER',
    });
    const scoped = await reports.createExport(
      teamManager,
      {
        filters: { from: '2026-08-09', timezone: 'Asia/Kolkata', to: '2026-08-09' },
        format: 'CSV',
        kind: 'LEAD_FUNNEL',
      },
      'scoped-export',
    );
    assert.equal('objectKey' in scoped.export, false);
    await reports.processExport(scoped.export.id);
    const scopedBody = Buffer.from([...objects.values()][0] ?? []).toString('utf8');
    assert.match(scopedBody, /NEW/u);
    assert.doesNotMatch(scopedBody, /ACCEPTED/u);

    await database.db.insert(schema.auditEvents).values({
      action: '=FORMULA_ACTION',
      actorId: managerUser,
      actorType: 'USER',
      clientOrganizationId: tenantId,
      correlationId: 'audit-export-evidence',
      entityId: leadA,
      entityType: 'LEAD',
      outcome: 'SUCCESS',
      scope: 'CLIENT',
    });
    const audit = await reports.createExport(
      context(),
      {
        filters: { from: '2026-08-09', timezone: 'Asia/Kolkata', to: '2026-08-09' },
        format: 'CSV',
        kind: 'AUDIT_EVENTS',
      },
      'audit-export',
    );
    await reports.processExport(audit.export.id);
    const storedAudit = [...objects.entries()].find(([key]) => key.includes(audit.export.id));
    const auditBody = Buffer.from(storedAudit?.[1] ?? []).toString('utf8');
    assert.match(auditBody, /'=FORMULA_ACTION/u);

    const listed = await reports.listExports(context(), { limit: 50 });
    assert.equal(
      listed.exports.every((job) => !('objectKey' in job)),
      true,
    );
    const downloaded = await reports.downloadExport(context(), audit.export.id);
    assert.equal('objectKey' in downloaded.export, false);
  });
});
