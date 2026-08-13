import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { schema, type DatabaseConnection } from '@gdm/database';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';

import { AnalyticsService } from '../src/analytics/analytics.service.js';
import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';

const agencyId = 'a1000000-0000-4000-8000-000000000001';
const tenantA = 'b1000000-0000-4000-8000-000000000001';
const tenantB = 'b1000000-0000-4000-8000-000000000002';
const branchA = 'c1000000-0000-4000-8000-000000000001';
const branchB = 'c1000000-0000-4000-8000-000000000002';
const contactA = 'd1000000-0000-4000-8000-000000000001';
const contactB = 'd1000000-0000-4000-8000-000000000002';
const leadA = 'e1000000-0000-4000-8000-000000000001';
const leadB = 'e1000000-0000-4000-8000-000000000002';

function clientContext(): AuthorizationContext {
  return {
    agencyId,
    assignmentScope: 'ALL',
    branchIds: new Set([branchA]),
    branchScopeMode: 'SELECTED',
    clientOrganizationId: tenantA,
    departmentIds: new Set(),
    departmentScopeMode: 'ALL',
    managedTeamIds: new Set(),
    membershipId: '11000000-0000-4000-8000-000000000001',
    permissionCodes: new Set(['leads.read']),
    roleCode: 'MANAGER',
    sessionId: '12000000-0000-4000-8000-000000000001',
    teamIds: new Set(),
    teamScopeMode: 'ALL',
    userId: '13000000-0000-4000-8000-000000000001',
  };
}

describe('analytics authorization and aggregation', () => {
  let database: MigratedPGliteTestDatabase;
  let service: AnalyticsService;

  before(async () => {
    database = await createMigratedPGliteTestDatabase();
    service = new AnalyticsService(
      { db: database.db } as unknown as DatabaseConnection,
      new AuthorizationPolicy(),
    );
    await database.db.insert(schema.agencies).values({
      code: 'ANALYTICS_TEST',
      displayName: 'Analytics Test',
      id: agencyId,
      legalName: 'Analytics Test Private Limited',
    });
    await database.db.insert(schema.clientOrganizations).values([
      {
        agencyId,
        code: 'ANALYTICS_A',
        displayName: 'Analytics A',
        id: tenantA,
        legalName: 'Analytics A Motors',
        status: 'ACTIVE',
        timezone: 'Asia/Kolkata',
      },
      {
        agencyId,
        code: 'ANALYTICS_B',
        displayName: 'Analytics B',
        id: tenantB,
        legalName: 'Analytics B Motors',
        status: 'ACTIVE',
        timezone: 'UTC',
      },
    ]);
    await database.db.insert(schema.branches).values([
      { clientOrganizationId: tenantA, code: 'A', id: branchA, name: 'Branch A' },
      { clientOrganizationId: tenantB, code: 'B', id: branchB, name: 'Branch B' },
    ]);
    await database.db.insert(schema.contacts).values([
      {
        clientOrganizationId: tenantA,
        displayName: 'Tenant A Customer',
        id: contactA,
        primaryPhoneE164: '+919100000001',
        primaryPhoneLookupHash: 'a'.repeat(64),
      },
      {
        clientOrganizationId: tenantB,
        displayName: 'Tenant B Customer',
        id: contactB,
        primaryPhoneE164: '+919100000002',
        primaryPhoneLookupHash: 'b'.repeat(64),
      },
    ]);
    await database.db.insert(schema.leadOpportunities).values([
      {
        branchId: branchA,
        capturedAt: new Date('2026-08-11T20:00:00.000Z'),
        clientOrganizationId: tenantA,
        contactId: contactA,
        entryMethod: 'MANUAL',
        id: leadA,
        slaDueAt: new Date('2026-08-11T20:15:00.000Z'),
        slaWarningAt: new Date('2026-08-11T20:10:00.000Z'),
        source: 'WEBSITE',
        status: 'NEW',
        vehicleInterest: 'Model A',
      },
      {
        branchId: branchB,
        capturedAt: new Date('2026-08-12T10:00:00.000Z'),
        clientOrganizationId: tenantB,
        contactId: contactB,
        entryMethod: 'MANUAL',
        id: leadB,
        slaDueAt: new Date('2026-08-12T10:15:00.000Z'),
        slaWarningAt: new Date('2026-08-12T10:10:00.000Z'),
        source: 'WALK_IN',
        status: 'NEW',
        vehicleInterest: 'Model B',
      },
    ]);
  });

  after(async () => database.close());

  it('uses the tenant timezone and excludes another tenant from every result surface', async () => {
    const result = await service.overview(clientContext(), {
      compare: 'NONE',
      from: '2026-08-12',
      timezone: 'UTC',
      to: '2026-08-12',
    });
    assert.equal(result.range.timezone, 'Asia/Kolkata');
    assert.equal(result.metrics.find((metric) => metric.code === 'lead_count')?.value, 1);
    assert.deepEqual(
      result.series.find((series) => series.code === 'source_distribution')?.dataset,
      [{ category: 'WEBSITE', value: 1 }],
    );
  });

  it('rejects an out-of-scope branch filter before querying analytics', async () => {
    await assert.rejects(
      service.overview(clientContext(), {
        branch_id: branchB,
        compare: 'NONE',
        from: '2026-08-12',
        timezone: 'Asia/Kolkata',
        to: '2026-08-12',
      }),
      /outside your authorization scope/u,
    );
  });

  it('returns aggregate-only agency comparisons without contact fields', async () => {
    const { clientOrganizationId: _clientOrganizationId, ...baseContext } = clientContext();
    const agencyContext: AuthorizationContext = {
      ...baseContext,
      branchIds: new Set<string>(),
      branchScopeMode: 'NONE' as const,
      permissionCodes: new Set(['reports.read'] as const),
      roleCode: 'AGENCY_ADMIN',
    };
    const result = await service.platform(agencyContext, {
      compare: 'NONE',
      from: '2026-08-12',
      timezone: 'Asia/Kolkata',
      to: '2026-08-12',
    });
    assert.equal(result.clients.length, 2);
    assert.deepEqual(
      result.metrics
        .filter((metric) =>
          ['platform_active_users', 'platform_booking_to_delivery'].includes(metric.code),
        )
        .map((metric) => ({ code: metric.code, unit: metric.unit, value: metric.value })),
      [
        { code: 'platform_booking_to_delivery', unit: 'PERCENT', value: 0 },
        { code: 'platform_active_users', unit: 'COUNT', value: 0 },
      ],
    );
    assert.equal(JSON.stringify(result).includes('Tenant A Customer'), false);
    assert.equal(JSON.stringify(result).includes('+9191'), false);
  });
});
