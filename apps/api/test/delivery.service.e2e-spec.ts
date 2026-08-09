import assert from 'node:assert/strict';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { afterEach, describe, it } from 'node:test';
import { schema, type DatabaseConnection } from '@gdm/database';
import type { UpdateDeliverySettingsRequest } from '@gdm/contracts';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { and, eq } from 'drizzle-orm';

import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import type { CommercialService } from '../src/commercial/commercial.service.js';
import type { DeliveryOtpSender } from '../src/delivery/delivery-otp-sender.port.js';
import type { DeliveryProofScanner } from '../src/delivery/delivery-proof-scanner.port.js';
import { DeliveryService } from '../src/delivery/delivery.service.js';
import type { ObjectStorage } from '../src/infrastructure/storage/object-storage.port.js';

const tenantId = 'd0000000-0000-4000-8000-000000000001';
const otherTenantId = 'd0000000-0000-4000-8000-000000000002';
const branchId = 'd1000000-0000-4000-8000-000000000001';
const managerUserId = 'd2000000-0000-4000-8000-000000000001';
const managerMembershipId = 'd3000000-0000-4000-8000-000000000001';
const executiveUserId = 'd2000000-0000-4000-8000-000000000002';
const executiveMembershipId = 'd3000000-0000-4000-8000-000000000002';
const contactId = 'd4000000-0000-4000-8000-000000000001';
const leadId = 'd5000000-0000-4000-8000-000000000001';
const unitId = 'd6000000-0000-4000-8000-000000000001';
const bookingId = 'd7000000-0000-4000-8000-000000000001';
const jobId = 'd8000000-0000-4000-8000-000000000001';

function managerContext(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    assignmentScope: 'ALL',
    branchIds: new Set([branchId]),
    branchScopeMode: 'SELECTED',
    clientOrganizationId: tenantId,
    departmentIds: new Set(),
    departmentScopeMode: 'ALL',
    managedTeamIds: new Set(),
    membershipId: managerMembershipId,
    permissionCodes: new Set(),
    roleCode: 'MANAGER',
    sessionId: 'd9000000-0000-4000-8000-000000000001',
    teamIds: new Set(),
    teamScopeMode: 'ALL',
    userId: managerUserId,
    ...overrides,
  };
}

function executiveContext(): AuthorizationContext {
  return managerContext({
    assignmentScope: 'ASSIGNED',
    membershipId: executiveMembershipId,
    roleCode: 'DELIVERY_EXECUTIVE',
    sessionId: 'd9000000-0000-4000-8000-000000000002',
    userId: executiveUserId,
  });
}

const unusedStorage: ObjectStorage = {
  createDownloadUrl: () => Promise.reject(new Error('Unexpected storage download.')),
  createUploadUrl: () => Promise.reject(new Error('Unexpected storage upload.')),
  stat: () => Promise.reject(new Error('Unexpected storage stat.')),
};
const cleanScanner: DeliveryProofScanner = {
  scan: () => Promise.resolve({ reason: 'Clean fixture.', status: 'CLEAN' }),
};
const unusedOtp: DeliveryOtpSender = {
  send: () => Promise.reject(new Error('Unexpected OTP delivery.')),
};

describe('Phase 9 delivery service integration', () => {
  let database: MigratedPGliteTestDatabase | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  async function setup(ready = true) {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    const agencyId = 'da000000-0000-4000-8000-000000000001';
    const brandId = 'db000000-0000-4000-8000-000000000001';
    const modelId = 'db000000-0000-4000-8000-000000000002';
    const variantId = 'db000000-0000-4000-8000-000000000003';
    const colourId = 'db000000-0000-4000-8000-000000000004';
    const quotationId = 'dc000000-0000-4000-8000-000000000001';
    const quotationVersionId = 'dc000000-0000-4000-8000-000000000002';
    await db.insert(schema.agencies).values({
      code: 'DELIVERY_TEST',
      displayName: 'Delivery Test',
      id: agencyId,
      legalName: 'Delivery Test Private Limited',
    });
    await db.insert(schema.clientOrganizations).values([
      {
        agencyId,
        code: 'DELIVERY_A',
        displayName: 'Delivery A',
        id: tenantId,
        legalName: 'Delivery A Motors',
        status: 'ACTIVE',
      },
      {
        agencyId,
        code: 'DELIVERY_B',
        displayName: 'Delivery B',
        id: otherTenantId,
        legalName: 'Delivery B Motors',
        status: 'ACTIVE',
      },
    ]);
    await db.insert(schema.branches).values({
      clientOrganizationId: tenantId,
      code: 'MAIN',
      id: branchId,
      name: 'Main Branch',
    });
    await db.insert(schema.users).values([
      {
        displayName: 'Delivery Manager',
        id: managerUserId,
        primaryEmailNormalized: 'manager@delivery.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'Delivery Executive',
        id: executiveUserId,
        primaryEmailNormalized: 'executive@delivery.test',
        status: 'ACTIVE',
      },
    ]);
    const roles = await db
      .select({ code: schema.roles.code, id: schema.roles.id })
      .from(schema.roles);
    const managerRole = roles.find((role) => role.code === 'MANAGER');
    const executiveRole = roles.find((role) => role.code === 'DELIVERY_EXECUTIVE');
    assert.ok(managerRole && executiveRole);
    await db.insert(schema.memberships).values([
      {
        assignmentScope: 'ALL',
        branchScopeMode: 'SELECTED',
        clientOrganizationId: tenantId,
        contextType: 'CLIENT',
        departmentScopeMode: 'ALL',
        id: managerMembershipId,
        roleId: managerRole.id,
        status: 'ACTIVE',
        teamScopeMode: 'ALL',
        userId: managerUserId,
      },
      {
        assignmentScope: 'ASSIGNED',
        branchScopeMode: 'SELECTED',
        clientOrganizationId: tenantId,
        contextType: 'CLIENT',
        departmentScopeMode: 'NONE',
        id: executiveMembershipId,
        roleId: executiveRole.id,
        status: 'ACTIVE',
        teamScopeMode: 'NONE',
        userId: executiveUserId,
      },
    ]);
    await db.insert(schema.membershipBranchScopes).values([
      { branchId, clientOrganizationId: tenantId, membershipId: managerMembershipId },
      { branchId, clientOrganizationId: tenantId, membershipId: executiveMembershipId },
    ]);
    await db.insert(schema.contacts).values({
      clientOrganizationId: tenantId,
      displayName: 'Delivery Customer',
      id: contactId,
      primaryPhoneE164: '+919900000008',
      primaryPhoneLookupHash: 'd'.repeat(64),
    });
    await db.insert(schema.leadOpportunities).values({
      branchId,
      clientOrganizationId: tenantId,
      contactId,
      entryMethod: 'MANUAL',
      id: leadId,
      slaDueAt: new Date(Date.now() + 900_000),
      slaWarningAt: new Date(Date.now() + 600_000),
      source: 'WALK_IN',
      status: 'NEGOTIATION',
      vehicleInterest: 'Delivery Test Vehicle',
    });
    await db.insert(schema.inventoryBrands).values({
      clientOrganizationId: tenantId,
      code: 'BRAND',
      id: brandId,
      name: 'Brand',
    });
    await db.insert(schema.inventoryModels).values({
      brandId,
      clientOrganizationId: tenantId,
      code: 'MODEL',
      id: modelId,
      name: 'Model',
    });
    await db.insert(schema.inventoryVariants).values({
      clientOrganizationId: tenantId,
      code: 'VARIANT',
      fuelPowertrain: 'EV',
      id: variantId,
      modelId,
      modelYear: 2026,
      name: 'Variant',
    });
    await db.insert(schema.inventoryColours).values({
      clientOrganizationId: tenantId,
      code: 'WHITE',
      id: colourId,
      name: 'White',
    });
    await db.insert(schema.inventoryUnits).values({
      branchId,
      clientOrganizationId: tenantId,
      colourId,
      createdByMembershipId: managerMembershipId,
      createdByUserId: managerUserId,
      id: unitId,
      ownershipType: 'DEALER_OWNED',
      status: 'ALLOCATED',
      unitReference: 'DELIVERY-UNIT',
      variantId,
    });
    await db.insert(schema.quotations).values({
      approvalStatus: 'NOT_REQUIRED',
      branchId,
      clientOrganizationId: tenantId,
      contactId,
      createdByMembershipId: managerMembershipId,
      createdByUserId: managerUserId,
      currency: 'INR',
      currentVersion: 1,
      discountMinor: 0,
      expiresAt: new Date(Date.now() + 86_400_000),
      id: quotationId,
      leadId,
      payableMinor: 100_000,
      quotationReference: 'QT-DELIVERY',
      status: 'ACTIVE',
      totalMinor: 100_000,
      vehicleConfiguration: 'Delivery Test Vehicle',
    });
    await db.insert(schema.quotationVersions).values({
      clientOrganizationId: tenantId,
      createdByMembershipId: managerMembershipId,
      createdByUserId: managerUserId,
      currency: 'INR',
      discountMinor: 0,
      expiresAt: new Date(Date.now() + 86_400_000),
      id: quotationVersionId,
      payableMinor: 100_000,
      quotationId,
      totalMinor: 100_000,
      vehicleConfiguration: 'Delivery Test Vehicle',
      version: 1,
    });
    await db.insert(schema.bookings).values({
      bookingReference: 'BK-DELIVERY',
      branchId,
      clientOrganizationId: tenantId,
      contactId,
      createdByMembershipId: managerMembershipId,
      createdByUserId: managerUserId,
      currency: 'INR',
      customerConfirmedAt: new Date(),
      id: bookingId,
      leadId,
      payableMinor: 100_000,
      paymentType: 'FULL',
      quotationId,
      quotationVersion: 1,
      selectedInventoryUnitId: unitId,
      status: 'CONFIRMED',
    });
    await db.insert(schema.inventoryAllocations).values({
      allocatedByMembershipId: managerMembershipId,
      allocatedByUserId: managerUserId,
      bookingId,
      bookingReference: 'BK-DELIVERY',
      clientOrganizationId: tenantId,
      inventoryUnitId: unitId,
      readinessAsserted: true,
      reason: 'Delivery integration fixture.',
    });
    await db.insert(schema.deliverySettings).values({
      clientOrganizationId: tenantId,
      requiredProofTypes: ['RECEIVED_BY'],
      updatedByMembershipId: managerMembershipId,
    });
    await db.insert(schema.deliveryJobs).values({
      assignedMembershipId: executiveMembershipId,
      assignedUserId: executiveUserId,
      bookingId,
      branchId,
      clientOrganizationId: tenantId,
      contactId,
      createdByMembershipId: managerMembershipId,
      destinationAddress: 'Baner, Pune',
      id: jobId,
      inventoryUnitId: unitId,
      leadId,
      scheduledFor: new Date(Date.now() + 3_600_000),
      status: 'DELIVERY_SCHEDULED',
    });
    await db.insert(schema.deliveryChecklistItems).values(
      [
        'ACCESSORIES',
        'PDI',
        'DOCUMENTS',
        'FUEL_OR_CHARGE',
        'BATTERY',
        'EXTERIOR_CONDITION',
        'INTERIOR_CONDITION',
      ].map((code) => ({
        checked: true,
        checkedAt: new Date(),
        checkedByMembershipId: managerMembershipId,
        clientOrganizationId: tenantId,
        code: code as (typeof schema.deliveryChecklistItems.$inferInsert)['code'],
        deliveryJobId: jobId,
        required: true,
      })),
    );
    let readinessCalls = 0;
    const commercial = {
      evaluateReadiness: () => {
        readinessCalls += 1;
        return Promise.resolve({
          booking_id: bookingId,
          evaluated_at: new Date().toISOString(),
          items: [],
          ready,
        });
      },
    } as unknown as CommercialService;
    return {
      db,
      readinessCalls: () => readinessCalls,
      service: new DeliveryService(
        { db } as unknown as DatabaseConnection,
        new AuthorizationPolicy(),
        commercial,
        unusedStorage,
        cleanScanner,
        unusedOtp,
        { otpPepper: 'delivery-test-pepper-at-least-32-characters' },
      ),
    };
  }

  it('blocks start when fresh canonical readiness is not ready', async () => {
    const { db, service } = await setup(false);
    await assert.rejects(
      service.start(
        executiveContext(),
        jobId,
        { disclosure_acknowledged: true, expected_version: 1 },
        'start-blocked',
        'corr-start-blocked',
      ),
      (error: unknown) => JSON.stringify(error).includes('DELIVERY_READINESS_BLOCKED'),
    );
    const [job] = await db
      .select()
      .from(schema.deliveryJobs)
      .where(eq(schema.deliveryJobs.id, jobId));
    assert.equal(job?.status, 'DELIVERY_SCHEDULED');
    assert.equal(job?.trackingActive, false);
  });

  it('updates bounded tenant delivery rules with an audited idempotent command', async () => {
    const { db, service } = await setup(true);
    const before = await service.getSettings(managerContext());
    const input: UpdateDeliverySettingsRequest = {
      active_timeout_minutes: 360,
      expected_version: before.version,
      location_retention_days: 14,
      location_stale_seconds: 120,
      reason: 'Approved delivery proof policy.',
      required_checklist_codes: ['PDI', 'DOCUMENTS'],
      required_proof_types: ['RECEIVED_BY'],
    };
    const updated = await service.updateSettings(
      managerContext(),
      input,
      'delivery-settings-update',
      'corr-settings',
    );
    const replay = await service.updateSettings(
      managerContext(),
      input,
      'delivery-settings-update',
      'corr-settings-retry',
    );

    assert.equal(updated.version, 2);
    assert.deepEqual(replay, updated);
    assert.deepEqual(updated.required_checklist_codes, ['PDI', 'DOCUMENTS']);
    const audits = await db
      .select({ id: schema.auditEvents.id })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, 'DELIVERY_SETTINGS_UPDATED'));
    assert.equal(audits.length, 1);
  });

  it('stops location immediately, delivers inventory and replays completion idempotently without RC', async () => {
    const { db, readinessCalls, service } = await setup(true);
    const started = await service.start(
      executiveContext(),
      jobId,
      { disclosure_acknowledged: true, expected_version: 1 },
      'start-ready',
      'corr-start-ready',
    );
    const startReplay = await service.start(
      executiveContext(),
      jobId,
      { disclosure_acknowledged: true, expected_version: 1 },
      'start-ready',
      'corr-start-ready-retry',
    );
    assert.deepEqual(startReplay, started);
    assert.equal(readinessCalls(), 1);
    await service.locations(
      executiveContext(),
      jobId,
      {
        samples: [
          {
            accuracy_m: 15,
            captured_at: new Date().toISOString(),
            idempotency_key: 'delivery-location-sample',
            latitude: 18.559,
            longitude: 73.7868,
          },
        ],
      },
      'corr-location',
    );
    const proof = await service.receivedBy(
      executiveContext(),
      jobId,
      { expected_version: started.version, received_by: 'Customer Recipient' },
      'received-by',
      'corr-received-by',
    );
    const first = await service.complete(
      executiveContext(),
      jobId,
      { expected_version: proof.version, received_by: null },
      'complete-offline',
      'corr-complete',
    );
    const replay = await service.complete(
      executiveContext(),
      jobId,
      { expected_version: proof.version, received_by: null },
      'complete-offline',
      'corr-complete-retry',
    );
    assert.deepEqual(replay, first);
    const [job] = await db
      .select()
      .from(schema.deliveryJobs)
      .where(eq(schema.deliveryJobs.id, jobId));
    const [session] = await db
      .select()
      .from(schema.deliveryLocationSessions)
      .where(eq(schema.deliveryLocationSessions.deliveryJobId, jobId));
    const [unit] = await db
      .select()
      .from(schema.inventoryUnits)
      .where(eq(schema.inventoryUnits.id, unitId));
    const [allocation] = await db
      .select()
      .from(schema.inventoryAllocations)
      .where(
        and(
          eq(schema.inventoryAllocations.bookingId, bookingId),
          eq(schema.inventoryAllocations.clientOrganizationId, tenantId),
        ),
      );
    assert.equal(job?.status, 'DELIVERED');
    assert.equal(job?.trackingActive, false);
    assert.ok(session?.stoppedAt);
    assert.equal(unit?.status, 'DELIVERED');
    assert.equal(allocation?.status, 'DELIVERED');
  });

  it('hides jobs and private proof from another tenant context', async () => {
    const { service } = await setup(true);
    const started = await service.start(
      executiveContext(),
      jobId,
      { disclosure_acknowledged: true, expected_version: 1 },
      'start-proof-scope',
      'corr-start-proof-scope',
    );
    const proof = await service.receivedBy(
      executiveContext(),
      jobId,
      { expected_version: started.version, received_by: 'Scoped Recipient' },
      'received-proof-scope',
      'corr-received-proof-scope',
    );
    if (!proof.proof_id) throw new Error('Received-by proof did not return an ID.');
    await assert.rejects(
      service.detail(
        managerContext({ clientOrganizationId: otherTenantId, branchIds: new Set() }),
        jobId,
      ),
      (error: unknown) => JSON.stringify(error).includes('NOT_FOUND'),
    );
    await assert.rejects(
      service.proofDownload(
        managerContext({ clientOrganizationId: otherTenantId, branchIds: new Set() }),
        proof.proof_id,
        'Cross-tenant attempt',
        'corr-cross-proof',
      ),
      (error: unknown) => JSON.stringify(error).includes('NOT_FOUND'),
    );
  });
});
