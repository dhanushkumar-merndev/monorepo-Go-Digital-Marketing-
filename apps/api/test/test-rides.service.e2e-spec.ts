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
import { TestRidesService } from '../src/test-rides/test-rides.service.js';

const tenantA = '20000000-0000-4000-8000-000000000661';
const tenantB = '20000000-0000-4000-8000-000000000662';
const branchA = '21000000-0000-4000-8000-000000000661';
const branchB = '21000000-0000-4000-8000-000000000662';
const departmentA = '21500000-0000-4000-8000-000000000661';
const teamA = '22000000-0000-4000-8000-000000000661';
const managerUser = '50000000-0000-4000-8000-000000000661';
const executiveUser = '50000000-0000-4000-8000-000000000662';
const otherExecutiveUser = '50000000-0000-4000-8000-000000000663';
const tenantBUser = '50000000-0000-4000-8000-000000000664';
const managerMembership = '60000000-0000-4000-8000-000000000661';
const executiveMembership = '60000000-0000-4000-8000-000000000662';
const otherExecutiveMembership = '60000000-0000-4000-8000-000000000663';
const tenantBMembership = '60000000-0000-4000-8000-000000000664';
const contactId = '70000000-0000-4000-8000-000000000661';
const leadId = '80000000-0000-4000-8000-000000000661';

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    assignmentScope: 'ALL',
    branchIds: new Set([branchA]),
    branchScopeMode: 'ALL',
    clientOrganizationId: tenantA,
    departmentIds: new Set([departmentA]),
    departmentScopeMode: 'ALL',
    managedTeamIds: new Set([teamA]),
    membershipId: managerMembership,
    permissionCodes: new Set(),
    roleCode: 'MANAGER',
    sessionId: '90000000-0000-4000-8000-000000000661',
    teamIds: new Set([teamA]),
    teamScopeMode: 'ALL',
    userId: managerUser,
    ...overrides,
  };
}

const checklist = {
  customer_briefed: true,
  documents_verified: true,
  exterior_checked: true,
  fuel_or_charge_checked: true,
  interior_checked: true,
  safety_equipment_checked: true,
};

describe('Phase 6 test-ride service integration', () => {
  let database: MigratedPGliteTestDatabase | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  it('enforces assigned start/location windows, stale active projection, tenant isolation and exactly-once completion', async () => {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    const agencyId = '10000000-0000-4000-8000-000000000661';
    await db.insert(schema.agencies).values({
      code: 'RIDE_TEST',
      displayName: 'Ride Test',
      id: agencyId,
      legalName: 'Ride Test Private Limited',
    });
    await db.insert(schema.clientOrganizations).values([
      {
        agencyId,
        code: 'RIDE_A',
        displayName: 'Ride A',
        id: tenantA,
        legalName: 'Ride A Motors',
        status: 'ACTIVE',
      },
      {
        agencyId,
        code: 'RIDE_B',
        displayName: 'Ride B',
        id: tenantB,
        legalName: 'Ride B Motors',
        status: 'ACTIVE',
      },
    ]);
    await db.insert(schema.branches).values([
      { clientOrganizationId: tenantA, code: 'A', id: branchA, name: 'A Branch' },
      { clientOrganizationId: tenantB, code: 'B', id: branchB, name: 'B Branch' },
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
      code: 'RIDE',
      departmentId: departmentA,
      id: teamA,
      name: 'Test Ride Team',
    });
    await db.insert(schema.users).values([
      {
        displayName: 'Manager',
        id: managerUser,
        primaryEmailNormalized: 'manager@ride.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Assigned Executive',
        id: executiveUser,
        primaryEmailNormalized: 'assigned@ride.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Other Executive',
        id: otherExecutiveUser,
        primaryEmailNormalized: 'other@ride.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Tenant B Manager',
        id: tenantBUser,
        primaryEmailNormalized: 'b@ride.test',
        status: 'ACTIVE',
      },
    ]);
    const roleRows = await db
      .select({ code: schema.roles.code, id: schema.roles.id })
      .from(schema.roles);
    const roleId = (code: string): string => {
      const value = roleRows.find((role) => role.code === code)?.id;
      assert.ok(value);
      return value;
    };
    await db.insert(schema.memberships).values([
      {
        assignmentScope: 'ALL',
        branchScopeMode: 'ALL',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: managerMembership,
        roleId: roleId('MANAGER'),
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: managerUser,
      },
      {
        assignmentScope: 'ASSIGNED',
        branchScopeMode: 'SELECTED',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        departmentScopeMode: 'NONE',
        id: executiveMembership,
        roleId: roleId('TEST_RIDE_EXECUTIVE'),
        status: 'ACTIVE',
        teamScopeMode: 'NONE',
        userId: executiveUser,
      },
      {
        assignmentScope: 'ASSIGNED',
        branchScopeMode: 'SELECTED',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        departmentScopeMode: 'NONE',
        id: otherExecutiveMembership,
        roleId: roleId('TEST_RIDE_EXECUTIVE'),
        status: 'ACTIVE',
        teamScopeMode: 'NONE',
        userId: otherExecutiveUser,
      },
      {
        assignmentScope: 'ALL',
        branchScopeMode: 'ALL',
        clientOrganizationId: tenantB,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: tenantBMembership,
        roleId: roleId('MANAGER'),
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: tenantBUser,
      },
    ]);
    await db.insert(schema.membershipBranchScopes).values([
      { branchId: branchA, clientOrganizationId: tenantA, membershipId: executiveMembership },
      { branchId: branchA, clientOrganizationId: tenantA, membershipId: otherExecutiveMembership },
    ]);
    await db.insert(schema.contacts).values({
      clientOrganizationId: tenantA,
      displayName: 'Ride Customer',
      id: contactId,
      primaryPhoneE164: '+919876543210',
      primaryPhoneLookupHash: 'ride-hash',
    });
    await db.insert(schema.assignmentQueues).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      code: 'RIDE_QUEUE',
      id: '23000000-0000-4000-8000-000000000661',
      name: 'Ride Queue',
      teamId: teamA,
    });
    await db.insert(schema.leadOpportunities).values({
      assignmentQueueId: '23000000-0000-4000-8000-000000000661',
      branchId: branchA,
      clientOrganizationId: tenantA,
      contactId,
      currentProcessOwnerId: managerUser,
      currentProcessOwnerMembershipId: managerMembership,
      entryMethod: 'MANUAL',
      id: leadId,
      relationshipOwnerId: managerUser,
      relationshipOwnerMembershipId: managerMembership,
      slaDueAt: new Date('2026-08-08T10:00:00.000Z'),
      slaWarningAt: new Date('2026-08-08T09:55:00.000Z'),
      source: 'WEBSITE',
      status: 'INTERESTED',
      vehicleInterest: 'Model X',
    });
    const service = new TestRidesService(
      { db } as unknown as DatabaseConnection,
      new AuthorizationPolicy(),
      {
        activeTimeoutMinutes: 180,
        locationRetentionDays: 30,
        locationStaleSeconds: 60,
        otpPepper: 'test-ride-integration-otp-pepper-32-chars',
      },
    );
    const created = await service.create(
      context(),
      {
        branch_id: branchA,
        customer_location: 'Customer home',
        demo_vehicle_reference: 'DEMO-X-1',
        lead_id: leadId,
        notes: 'Customer prefers a quiet route.',
        otp_code: '2468',
        scheduled_end_at: '2026-08-09T06:30:00.000Z',
        scheduled_start_at: '2026-08-09T05:30:00.000Z',
        vehicle_model: 'Model X',
      },
      'create-ride-operation',
      'create-ride',
    );
    const createdReplay = await service.create(
      context(),
      {
        branch_id: branchA,
        customer_location: 'Customer home',
        demo_vehicle_reference: 'DEMO-X-1',
        lead_id: leadId,
        notes: 'Customer prefers a quiet route.',
        otp_code: '2468',
        scheduled_end_at: '2026-08-09T06:30:00.000Z',
        scheduled_start_at: '2026-08-09T05:30:00.000Z',
        vehicle_model: 'Model X',
      },
      'create-ride-operation',
      'create-ride-replay',
    );
    assert.deepEqual(createdReplay, created);
    const createdJobs = await db
      .select({ count: count() })
      .from(schema.testRideJobs)
      .where(eq(schema.testRideJobs.leadId, leadId));
    assert.equal(createdJobs[0]?.count, 1);
    const booked = await service.book(context(), created.id, { expected_version: 1 }, 'book-ride');
    const confirmed = await service.confirm(
      context(),
      created.id,
      { channel: 'CALL', confirmed_at: new Date().toISOString(), expected_version: booked.version },
      'confirm-ride',
    );
    const assigned = await service.assign(
      context(),
      created.id,
      {
        executive_membership_id: executiveMembership,
        expected_version: confirmed.version,
        reason: 'Branch roster assignment.',
      },
      'assign-ride',
    );
    const assignedContext = context({
      assignmentScope: 'ASSIGNED',
      branchScopeMode: 'SELECTED',
      departmentScopeMode: 'NONE',
      membershipId: executiveMembership,
      roleCode: 'TEST_RIDE_EXECUTIVE',
      teamScopeMode: 'NONE',
      userId: executiveUser,
    });
    const otherContext = context({
      assignmentScope: 'ASSIGNED',
      branchScopeMode: 'SELECTED',
      departmentScopeMode: 'NONE',
      membershipId: otherExecutiveMembership,
      roleCode: 'TEST_RIDE_EXECUTIVE',
      teamScopeMode: 'NONE',
      userId: otherExecutiveUser,
    });

    await assert.rejects(
      () =>
        service.locations(
          assignedContext,
          created.id,
          {
            samples: [
              {
                accuracy_m: 10,
                captured_at: new Date().toISOString(),
                idempotency_key: 'before-start',
                latitude: 18.5204,
                longitude: 73.8567,
              },
            ],
          },
          'before-start',
        ),
      /active/u,
    );
    await assert.rejects(
      () =>
        service.start(
          otherContext,
          created.id,
          {
            checklist,
            disclosure_acknowledged: true,
            expected_version: assigned.version,
            odometer_km: 1200,
            otp_code: '2468',
          },
          'wrong-executive-start',
          'wrong-executive-start',
        ),
      /not found|assigned/u,
    );
    const started = await service.start(
      assignedContext,
      created.id,
      {
        checklist,
        disclosure_acknowledged: true,
        expected_version: assigned.version,
        odometer_km: 1200,
        otp_code: '2468',
      },
      'assigned-start',
      'assigned-start',
    );
    const oldCapture = new Date(Date.now() - 120_000);
    await db
      .update(schema.testRideLocationSessions)
      .set({ startedAt: new Date(Date.now() - 180_000) })
      .where(eq(schema.testRideLocationSessions.testRideJobId, created.id));
    await service.locations(
      assignedContext,
      created.id,
      {
        samples: [
          {
            accuracy_m: 12,
            captured_at: oldCapture.toISOString(),
            idempotency_key: 'location-1',
            latitude: 18.5204,
            longitude: 73.8567,
          },
        ],
      },
      'location-1',
    );
    const duplicate = await service.locations(
      assignedContext,
      created.id,
      {
        samples: [
          {
            accuracy_m: 12,
            captured_at: oldCapture.toISOString(),
            idempotency_key: 'location-1',
            latitude: 18.5204,
            longitude: 73.8567,
          },
        ],
      },
      'location-duplicate',
    );
    assert.deepEqual(duplicate, { accepted: 0, duplicates: 1 });
    const active = await service.list(context(), {
      assigned_to_me: false,
      limit: 100,
      status: 'ACTIVE',
    });
    assert.equal(active.rides.length, 1);
    assert.equal(active.rides[0]?.status, 'ACTIVE');
    assert.equal(active.rides[0]?.last_location?.stale, true);
    await db
      .update(schema.testRideLocationSamples)
      .set({ expiresAt: new Date(oldCapture.getTime() + 60_000) })
      .where(eq(schema.testRideLocationSamples.testRideJobId, created.id));
    assert.deepEqual(await service.reconcileTracking(context(), 'retention-reconcile'), {
      deleted_locations: 1,
      stopped: 0,
    });
    const retainedLocations = await db
      .select({ count: count() })
      .from(schema.testRideLocationSamples)
      .where(eq(schema.testRideLocationSamples.testRideJobId, created.id));
    assert.equal(retainedLocations[0]?.count, 0);
    await assert.rejects(
      () =>
        service.complete(
          assignedContext,
          created.id,
          {
            checklist: { ...checklist, vehicle_returned: false as true },
            completion_evidence: 'Vehicle returned without damage.',
            end_odometer_km: 1210,
            expected_version: started.version,
            feedback: 'Customer liked the drive.',
          },
          'incomplete-checklist',
          'incomplete-checklist',
        ),
      /checklist/u,
    );
    const completionInput = {
      checklist: { ...checklist, vehicle_returned: true as const },
      completion_evidence: 'Vehicle returned; exterior and interior rechecked.',
      end_odometer_km: 1210,
      expected_version: started.version,
      feedback: 'Customer liked the drive.',
    };
    const completed = await service.complete(
      assignedContext,
      created.id,
      completionInput,
      'complete-offline-operation-1',
      'complete-1',
    );
    const replayed = await service.complete(
      assignedContext,
      created.id,
      completionInput,
      'complete-offline-operation-1',
      'complete-replay',
    );
    assert.deepEqual(replayed, completed);
    const completionEvents = await db
      .select({ count: count() })
      .from(schema.testRideEvents)
      .where(
        and(
          eq(schema.testRideEvents.testRideJobId, created.id),
          eq(schema.testRideEvents.eventType, 'RIDE_COMPLETED'),
        ),
      );
    assert.equal(completionEvents[0]?.count, 1);
    assert.equal(
      (await service.list(context(), { assigned_to_me: false, limit: 100, status: 'ACTIVE' })).rides
        .length,
      0,
    );

    const competingInput = {
      branch_id: branchA,
      customer_location: 'Customer home',
      demo_vehicle_reference: 'DEMO-RACE-1',
      lead_id: leadId,
      notes: null,
      otp_code: null,
      scheduled_end_at: '2026-08-10T06:30:00.000Z',
      scheduled_start_at: '2026-08-10T05:30:00.000Z',
      vehicle_model: 'Model X',
    };
    const [firstCompetingRide, secondCompetingRide] = await Promise.all([
      service.create(context(), competingInput, 'create-race-a', 'create-race-a'),
      service.create(context(), competingInput, 'create-race-b', 'create-race-b'),
    ]);
    const bookingRace = await Promise.allSettled([
      service.book(
        context(),
        firstCompetingRide.id,
        { expected_version: firstCompetingRide.version },
        'book-race-a',
      ),
      service.book(
        context(),
        secondCompetingRide.id,
        { expected_version: secondCompetingRide.version },
        'book-race-b',
      ),
    ]);
    assert.equal(
      bookingRace.filter((result) => result.status === 'fulfilled').length,
      1,
      'the allocation lock must allow exactly one overlapping demo-vehicle booking',
    );
    assert.equal(bookingRace.filter((result) => result.status === 'rejected').length, 1);

    await assert.rejects(
      () =>
        service.locations(
          assignedContext,
          created.id,
          {
            samples: [
              {
                accuracy_m: 10,
                captured_at: new Date().toISOString(),
                idempotency_key: 'after-stop',
                latitude: 18.52,
                longitude: 73.85,
              },
            ],
          },
          'after-stop',
        ),
      /active/u,
    );
    await assert.rejects(
      () =>
        service.detail(
          context({
            branchIds: new Set([branchB]),
            clientOrganizationId: tenantB,
            departmentIds: new Set(),
            managedTeamIds: new Set(),
            membershipId: tenantBMembership,
            teamIds: new Set(),
            userId: tenantBUser,
          }),
          created.id,
        ),
      /not found/u,
    );
  });
});
