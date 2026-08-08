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
import { InventoryService } from '../src/inventory/inventory.service.js';

const tenantA = 'a0000000-0000-4000-8000-000000000001';
const tenantB = 'a0000000-0000-4000-8000-000000000002';
const branchA = 'a1000000-0000-4000-8000-000000000001';
const branchA2 = 'a1000000-0000-4000-8000-000000000002';
const branchB = 'a1000000-0000-4000-8000-000000000003';
const managerUser = 'a2000000-0000-4000-8000-000000000001';
const inventoryUser = 'a2000000-0000-4000-8000-000000000002';
const tenantBUser = 'a2000000-0000-4000-8000-000000000003';
const managerMembership = 'a3000000-0000-4000-8000-000000000001';
const inventoryMembership = 'a3000000-0000-4000-8000-000000000002';
const tenantBMembership = 'a3000000-0000-4000-8000-000000000003';
const variantId = 'a4000000-0000-4000-8000-000000000003';
const colourId = 'a4000000-0000-4000-8000-000000000004';
const allocationUnitId = 'a5000000-0000-4000-8000-000000000001';
const reservationUnitId = 'a5000000-0000-4000-8000-000000000002';
const transferUnitId = 'a5000000-0000-4000-8000-000000000003';
const demoUnitId = 'a5000000-0000-4000-8000-000000000004';

function managerContext(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    assignmentScope: 'ALL',
    branchIds: new Set([branchA, branchA2]),
    branchScopeMode: 'ALL',
    clientOrganizationId: tenantA,
    departmentIds: new Set(),
    departmentScopeMode: 'ALL',
    managedTeamIds: new Set(),
    membershipId: managerMembership,
    permissionCodes: new Set([
      'inventory.allocations.manage',
      'inventory.allocations.reallocate',
      'inventory.corrections.manage',
      'inventory.reservations.manage',
      'inventory.transfers.manage',
      'inventory.units.manage',
      'inventory.units.read',
      'inventory.units.sensitive.read',
    ]),
    roleCode: 'MANAGER',
    sessionId: 'a6000000-0000-4000-8000-000000000001',
    teamIds: new Set(),
    teamScopeMode: 'ALL',
    userId: managerUser,
    ...overrides,
  };
}

describe('Phase 7 inventory service integration', () => {
  let database: MigratedPGliteTestDatabase | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  async function setup(): Promise<{
    db: MigratedPGliteTestDatabase['db'];
    service: InventoryService;
  }> {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    const agencyId = 'aa000000-0000-4000-8000-000000000001';
    await db.insert(schema.agencies).values({
      code: 'INVENTORY_TEST',
      displayName: 'Inventory Test',
      id: agencyId,
      legalName: 'Inventory Test Private Limited',
    });
    await db.insert(schema.clientOrganizations).values([
      {
        agencyId,
        code: 'INV_A',
        displayName: 'Inventory A',
        id: tenantA,
        legalName: 'Inventory A Motors',
        status: 'ACTIVE',
      },
      {
        agencyId,
        code: 'INV_B',
        displayName: 'Inventory B',
        id: tenantB,
        legalName: 'Inventory B Motors',
        status: 'ACTIVE',
      },
    ]);
    await db.insert(schema.branches).values([
      { clientOrganizationId: tenantA, code: 'A', id: branchA, name: 'A Branch' },
      { clientOrganizationId: tenantA, code: 'A2', id: branchA2, name: 'A Second Branch' },
      { clientOrganizationId: tenantB, code: 'B', id: branchB, name: 'B Branch' },
    ]);
    await db.insert(schema.users).values([
      {
        displayName: 'Inventory Manager',
        id: managerUser,
        primaryEmailNormalized: 'manager@inventory.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Inventory Executive',
        id: inventoryUser,
        primaryEmailNormalized: 'operator@inventory.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Tenant B Manager',
        id: tenantBUser,
        primaryEmailNormalized: 'tenant-b@inventory.test',
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
        assignmentScope: 'ALL',
        branchScopeMode: 'ALL',
        clientOrganizationId: tenantA,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: inventoryMembership,
        roleId: roleId('INVENTORY_EXECUTIVE'),
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: inventoryUser,
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
    const brandId = 'a4000000-0000-4000-8000-000000000001';
    const modelId = 'a4000000-0000-4000-8000-000000000002';
    await db.insert(schema.inventoryBrands).values({
      clientOrganizationId: tenantA,
      code: 'TEST',
      id: brandId,
      name: 'Test Brand',
    });
    await db.insert(schema.inventoryModels).values({
      brandId,
      clientOrganizationId: tenantA,
      code: 'MODEL',
      id: modelId,
      name: 'Test Model',
    });
    await db.insert(schema.inventoryVariants).values({
      clientOrganizationId: tenantA,
      code: 'VARIANT',
      fuelPowertrain: 'ELECTRIC',
      id: variantId,
      modelId,
      modelYear: 2026,
      name: 'Test Variant',
    });
    await db.insert(schema.inventoryColours).values({
      clientOrganizationId: tenantA,
      code: 'WHITE',
      id: colourId,
      name: 'White',
    });
    await db.insert(schema.inventoryUnits).values([
      {
        branchId: branchA,
        chassisNumber: 'ALLOCCHASSIS',
        clientOrganizationId: tenantA,
        colourId,
        createdByMembershipId: managerMembership,
        createdByUserId: managerUser,
        id: allocationUnitId,
        ownershipType: 'DEALER_OWNED',
        status: 'AVAILABLE',
        unitReference: 'ALLOC-UNIT',
        variantId,
        vin: 'ALLOCVIN000000001',
      },
      {
        branchId: branchA,
        chassisNumber: 'RESERVECHASSIS',
        clientOrganizationId: tenantA,
        colourId,
        createdByMembershipId: managerMembership,
        createdByUserId: managerUser,
        id: reservationUnitId,
        ownershipType: 'DEALER_OWNED',
        status: 'AVAILABLE',
        unitReference: 'RESERVE-UNIT',
        variantId,
        vin: 'RESERVEVIN0000001',
      },
      {
        branchId: branchA,
        chassisNumber: 'TRANSFERCHASSIS',
        clientOrganizationId: tenantA,
        colourId,
        createdByMembershipId: managerMembership,
        createdByUserId: managerUser,
        id: transferUnitId,
        ownershipType: 'DEALER_OWNED',
        status: 'AVAILABLE',
        unitReference: 'TRANSFER-UNIT',
        variantId,
        vin: 'TRANSFERVIN000001',
      },
      {
        branchId: branchA,
        chassisNumber: 'DEMOCHASSIS',
        clientOrganizationId: tenantA,
        colourId,
        createdByMembershipId: managerMembership,
        createdByUserId: managerUser,
        id: demoUnitId,
        ownershipType: 'DEALER_OWNED',
        status: 'DEMO',
        unitReference: 'DEMO-UNIT',
        variantId,
        vin: 'DEMOVIN0000000001',
      },
    ]);
    return {
      db,
      service: new InventoryService(
        { db } as unknown as DatabaseConnection,
        new AuthorizationPolicy(),
      ),
    };
  }

  it('receives expected stock with late identifiers and a server receipt timestamp', async () => {
    const { db, service } = await setup();
    const created = await service.createUnit(
      managerContext(),
      {
        acquisition_reference: null,
        branch_id: branchA,
        chassis_number: null,
        colour_id: colourId,
        condition_notes: null,
        current_odometer_km: 0,
        engine_number: null,
        expected_arrival_at: new Date(Date.now() + 86_400_000).toISOString(),
        ownership_type: 'DEALER_OWNED',
        received_at: null,
        service_due_at: null,
        status: 'EXPECTED',
        unit_reference: 'EXPECTED-UNIT',
        variant_id: variantId,
        vin: null,
      },
      'create-expected-unit',
      'corr-create-expected',
    );
    await service.transition(
      managerContext(),
      created.id,
      {
        action: 'RECEIVE',
        chassis_number: 'LATECHASSIS0001',
        current_odometer_km: 7,
        engine_number: 'LATEENGINE0001',
        expected_version: created.version,
        reason: 'Identifiers verified in the receiving bay.',
        vin: 'LATEVIN000000001',
      },
      'receive-expected-unit',
      'corr-receive-expected',
    );
    const [unit] = await db
      .select()
      .from(schema.inventoryUnits)
      .where(eq(schema.inventoryUnits.id, created.id));
    assert.equal(unit?.status, 'AVAILABLE');
    assert.equal(unit?.vin, 'LATEVIN000000001');
    assert.equal(unit?.chassisNumber, 'LATECHASSIS0001');
    assert.equal(unit?.currentOdometerKm, 7);
    assert.ok(unit?.receivedAt instanceof Date);
  });

  it('serializes concurrent VIN allocation and writes one active allocation with evidence', async () => {
    const { db, service } = await setup();
    const input = {
      booking_reference: 'BOOKING-1001',
      expected_version: 1,
      readiness_asserted: true as const,
      reason: 'Confirmed booking ready for allocation.',
    };
    const results = await Promise.allSettled([
      service.allocate(
        managerContext(),
        allocationUnitId,
        input,
        'allocate-concurrent-a',
        'corr-a',
      ),
      service.allocate(
        managerContext(),
        allocationUnitId,
        input,
        'allocate-concurrent-b',
        'corr-b',
      ),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    const [active] = await db
      .select({ count: count() })
      .from(schema.inventoryAllocations)
      .where(
        and(
          eq(schema.inventoryAllocations.clientOrganizationId, tenantA),
          eq(schema.inventoryAllocations.inventoryUnitId, allocationUnitId),
          eq(schema.inventoryAllocations.status, 'ACTIVE'),
        ),
      );
    const [unit] = await db
      .select()
      .from(schema.inventoryUnits)
      .where(eq(schema.inventoryUnits.id, allocationUnitId));
    assert.equal(active?.count, 1);
    assert.equal(unit?.status, 'ALLOCATED');
    assert.equal(unit?.version, 2);
    const [history] = await db
      .select({ count: count() })
      .from(schema.inventoryUnitStatusHistory)
      .where(eq(schema.inventoryUnitStatusHistory.inventoryUnitId, allocationUnitId));
    assert.equal(history?.count, 1);
  });

  it('expires a reservation safely and idempotently', async () => {
    const { db, service } = await setup();
    const reserved = await service.reserve(
      managerContext(),
      reservationUnitId,
      {
        booking_reference: 'BOOKING-EXPIRE',
        expected_version: 1,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        lead_id: null,
        reason: 'Temporary booking hold.',
      },
      'reserve-expiring',
      'corr-reserve',
    );
    await db
      .update(schema.inventoryReservations)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.inventoryReservations.id, reserved.id));
    const first = await service.reconcileAllReservations(new Date());
    const replay = await service.reconcileReservations(
      managerContext(),
      'reconcile-expiring',
      'corr-expire-retry',
    );
    const secondPass = await service.reconcileReservations(
      managerContext(),
      'reconcile-expiring-next',
      'corr-expire-next',
    );
    assert.deepEqual(first, { expired: 1 });
    assert.deepEqual(replay, { expired: 0 });
    assert.deepEqual(secondPass, { expired: 0 });
    const [reservation] = await db
      .select()
      .from(schema.inventoryReservations)
      .where(eq(schema.inventoryReservations.id, reserved.id));
    const [unit] = await db
      .select()
      .from(schema.inventoryUnits)
      .where(eq(schema.inventoryUnits.id, reservationUnitId));
    assert.equal(reservation?.status, 'EXPIRED');
    assert.equal(unit?.status, 'AVAILABLE');
  });

  it('completes a branch transfer through append-only history', async () => {
    const { db, service } = await setup();
    const started = await service.startTransfer(
      managerContext(),
      transferUnitId,
      {
        expected_version: 1,
        reason: 'Move demo capacity to second branch.',
        reference: 'TRANSFER-2026-1',
        to_branch_id: branchA2,
      },
      'transfer-start',
      'corr-transfer-start',
    );
    const completed = await service.endTransfer(
      managerContext(),
      started.id,
      { expected_version: 2, reason: 'Vehicle received and inspected.' },
      'COMPLETED',
      'transfer-complete',
      'corr-transfer-complete',
    );
    assert.equal(completed.status, 'COMPLETED');
    const [unit] = await db
      .select()
      .from(schema.inventoryUnits)
      .where(eq(schema.inventoryUnits.id, transferUnitId));
    assert.equal(unit?.branchId, branchA2);
    assert.equal(unit?.status, 'AVAILABLE');
    const testDatabase = database;
    if (!testDatabase) throw new Error('Test database was not initialized.');
    await assert.rejects(
      testDatabase.client.exec(
        `update inventory_transfers set reason = 'rewrite' where id = '${started.id}'`,
      ),
      /append-only/u,
    );
    await assert.rejects(() =>
      service.endTransfer(
        managerContext(),
        started.id,
        { expected_version: 3, reason: 'Attempt second terminal event.' },
        'CANCELLED',
        'transfer-cancel-late',
        'corr-transfer-cancel-late',
      ),
    );
  });

  it('hides cross-tenant/branch stock and blocks unauthorized demo sale correction', async () => {
    const { service } = await setup();
    await assert.rejects(() =>
      service.detail(
        managerContext({
          branchIds: new Set([branchB]),
          clientOrganizationId: tenantB,
          membershipId: tenantBMembership,
          userId: tenantBUser,
        }),
        demoUnitId,
      ),
    );
    await assert.rejects(() =>
      service.detail(
        managerContext({ branchIds: new Set([branchA2]), branchScopeMode: 'SELECTED' }),
        demoUnitId,
      ),
    );
    await assert.rejects(
      () =>
        service.transition(
          managerContext({
            membershipId: inventoryMembership,
            permissionCodes: new Set(['inventory.units.manage']),
            roleCode: 'INVENTORY_EXECUTIVE',
            userId: inventoryUser,
          }),
          demoUnitId,
          {
            action: 'AUTHORIZE_DEMO_SALE',
            expected_version: 1,
            reason: 'Unauthorized sale conversion attempt.',
          },
          'demo-sale-unauthorized',
          'corr-demo-sale-unauthorized',
        ),
      /manager permission/u,
    );
    await assert.rejects(
      () =>
        service.transition(
          managerContext({
            membershipId: inventoryMembership,
            permissionCodes: new Set(['inventory.units.manage']),
            roleCode: 'INVENTORY_EXECUTIVE',
            userId: inventoryUser,
          }),
          demoUnitId,
          {
            action: 'BLOCK',
            expected_version: 1,
            reason: 'Unauthorized correction attempt.',
          },
          'demo-block-unauthorized',
          'corr-demo-block-unauthorized',
        ),
      /manager permission/u,
    );
  });

  it('maps an exact legacy Phase 6 demo reference additively without rewriting ride history', async () => {
    const { db, service } = await setup();
    const contactId = 'ab000000-0000-4000-8000-000000000001';
    const leadId = 'ab000000-0000-4000-8000-000000000002';
    const rideId = 'ab000000-0000-4000-8000-000000000003';
    const bookingId = 'ab000000-0000-4000-8000-000000000004';
    const rideEventId = 'ab000000-0000-4000-8000-000000000005';
    await db.insert(schema.contacts).values({
      clientOrganizationId: tenantA,
      displayName: 'Legacy Ride Customer',
      id: contactId,
      primaryPhoneE164: '+919999123456',
      primaryPhoneLookupHash: 'legacy-ride-contact',
    });
    await db.insert(schema.leadOpportunities).values({
      branchId: branchA,
      capturedAt: new Date(),
      clientOrganizationId: tenantA,
      contactId,
      entryMethod: 'MANUAL',
      id: leadId,
      slaDueAt: new Date(Date.now() + 900_000),
      slaWarningAt: new Date(Date.now() + 600_000),
      source: 'WALK_IN',
      status: 'TEST_RIDE_BOOKED',
      vehicleInterest: 'Legacy demo',
    });
    await db.insert(schema.testRideJobs).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      contactId,
      createdBy: managerUser,
      customerLocation: 'Pune',
      demoVehicleReference: 'LEGACY-DEMO-01',
      id: rideId,
      leadId,
      scheduledEndAt: new Date(Date.now() + 7_200_000),
      scheduledStartAt: new Date(Date.now() + 3_600_000),
      status: 'BOOKED',
      vehicleModel: 'Legacy demo',
    });
    await db.insert(schema.demoVehicleBookings).values({
      branchId: branchA,
      clientOrganizationId: tenantA,
      demoVehicleReference: 'LEGACY-DEMO-01',
      id: bookingId,
      scheduledEndAt: new Date(Date.now() + 7_200_000),
      scheduledStartAt: new Date(Date.now() + 3_600_000),
      status: 'HELD',
      testRideJobId: rideId,
    });
    await db.insert(schema.testRideEvents).values({
      actorMembershipId: managerMembership,
      actorUserId: managerUser,
      clientOrganizationId: tenantA,
      eventType: 'RIDE_BOOKED',
      evidence: { legacy: true },
      fromStatus: 'REQUESTED',
      id: rideEventId,
      testRideJobId: rideId,
      toStatus: 'BOOKED',
    });
    const created = await service.createUnit(
      managerContext(),
      {
        acquisition_reference: 'LEGACY-IMPORT',
        branch_id: branchA,
        chassis_number: 'LEGACYCHASSIS01',
        colour_id: colourId,
        condition_notes: null,
        current_odometer_km: 10,
        engine_number: 'LEGACYENGINE01',
        expected_arrival_at: null,
        ownership_type: 'DEALER_OWNED',
        received_at: new Date().toISOString(),
        service_due_at: null,
        status: 'DEMO',
        unit_reference: 'LEGACY-DEMO-01',
        variant_id: variantId,
        vin: 'LEGACYVIN00000001',
      },
      'legacy-demo-map',
      'corr-legacy-demo-map',
    );
    const [ride] = await db
      .select()
      .from(schema.testRideJobs)
      .where(eq(schema.testRideJobs.id, rideId));
    const [booking] = await db
      .select()
      .from(schema.demoVehicleBookings)
      .where(eq(schema.demoVehicleBookings.id, bookingId));
    const [event] = await db
      .select()
      .from(schema.testRideEvents)
      .where(eq(schema.testRideEvents.id, rideEventId));
    assert.equal(ride?.inventoryUnitId, created.id);
    assert.equal(ride?.demoVehicleReference, 'LEGACY-DEMO-01');
    assert.equal(booking?.inventoryUnitId, created.id);
    assert.deepEqual(event?.evidence, { legacy: true });

    const transfer = await service.startTransfer(
      managerContext(),
      created.id,
      {
        expected_version: created.version,
        reason: 'Move the physical demo while retaining its historical ride attribution.',
        reference: 'TRANSFER-LEGACY-DEMO',
        to_branch_id: branchA2,
      },
      'legacy-demo-transfer-start',
      'corr-legacy-demo-transfer-start',
    );
    await service.endTransfer(
      managerContext(),
      transfer.id,
      {
        expected_version: transfer.unit_version,
        reason: 'Vehicle received at the destination branch.',
      },
      'COMPLETED',
      'legacy-demo-transfer-complete',
      'corr-legacy-demo-transfer-complete',
    );
    const [transferredUnit] = await db
      .select()
      .from(schema.inventoryUnits)
      .where(eq(schema.inventoryUnits.id, created.id));
    const [historicalRide] = await db
      .select()
      .from(schema.testRideJobs)
      .where(eq(schema.testRideJobs.id, rideId));
    assert.equal(transferredUnit?.branchId, branchA2);
    assert.equal(historicalRide?.branchId, branchA);
    assert.equal(historicalRide?.inventoryUnitId, created.id);
    assert.equal(historicalRide?.demoVehicleReference, 'LEGACY-DEMO-01');
  });
});
