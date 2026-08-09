import assert from 'node:assert/strict';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { afterEach, describe, it } from 'node:test';
import { schema, type DatabaseConnection } from '@gdm/database';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { and, eq } from 'drizzle-orm';

import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import type { ObjectStorage } from '../src/infrastructure/storage/object-storage.port.js';
import type { RcDocumentScanner } from '../src/registration/rc-document-scanner.port.js';
import { RegistrationService } from '../src/registration/registration.service.js';

const tenantId = 'a0000000-0000-4000-8000-000000000001';
const otherTenantId = 'a0000000-0000-4000-8000-000000000002';
const branchId = 'a1000000-0000-4000-8000-000000000001';
const managerUserId = 'a2000000-0000-4000-8000-000000000001';
const managerMembershipId = 'a3000000-0000-4000-8000-000000000001';
const executiveUserId = 'a2000000-0000-4000-8000-000000000002';
const executiveMembershipId = 'a3000000-0000-4000-8000-000000000002';
const contactId = 'a4000000-0000-4000-8000-000000000001';
const leadId = 'a5000000-0000-4000-8000-000000000001';
const unitId = 'a6000000-0000-4000-8000-000000000001';
const bookingId = 'a7000000-0000-4000-8000-000000000001';
const deliveryId = 'a8000000-0000-4000-8000-000000000001';

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
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
    sessionId: 'a9000000-0000-4000-8000-000000000001',
    teamIds: new Set(),
    teamScopeMode: 'ALL',
    userId: managerUserId,
    ...overrides,
  };
}

const storage: ObjectStorage = {
  createDownloadUrl: () =>
    Promise.resolve({
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      method: 'GET',
      url: 'https://private.invalid/signed',
    }),
  createUploadUrl: () =>
    Promise.resolve({
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      method: 'PUT',
      url: 'https://private.invalid/upload',
    }),
  stat: () => Promise.resolve(undefined),
};
const cleanScanner: RcDocumentScanner = {
  scan: () => Promise.resolve({ reason: 'Clean fixture.', status: 'CLEAN' }),
};

describe('Phase 10 registration and customer vehicle integration', () => {
  let database: MigratedPGliteTestDatabase | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  async function setup(delivered = false) {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    const agencyId = 'aa000000-0000-4000-8000-000000000001';
    const brandId = 'ab000000-0000-4000-8000-000000000001';
    const modelId = 'ab000000-0000-4000-8000-000000000002';
    const variantId = 'ab000000-0000-4000-8000-000000000003';
    const colourId = 'ab000000-0000-4000-8000-000000000004';
    const quotationId = 'ac000000-0000-4000-8000-000000000001';
    const quotationVersionId = 'ac000000-0000-4000-8000-000000000002';
    await db.insert(schema.agencies).values({
      code: 'REG_TEST',
      displayName: 'Registration Test',
      id: agencyId,
      legalName: 'Registration Test Private Limited',
    });
    await db.insert(schema.clientOrganizations).values([
      {
        agencyId,
        code: 'REG_A',
        displayName: 'Registration A',
        id: tenantId,
        legalName: 'Registration A Motors',
        status: 'ACTIVE',
      },
      {
        agencyId,
        code: 'REG_B',
        displayName: 'Registration B',
        id: otherTenantId,
        legalName: 'Registration B Motors',
        status: 'ACTIVE',
      },
    ]);
    await db
      .insert(schema.branches)
      .values({ clientOrganizationId: tenantId, code: 'MAIN', id: branchId, name: 'Main Branch' });
    await db.insert(schema.users).values([
      {
        displayName: 'Registration Manager',
        id: managerUserId,
        primaryEmailNormalized: 'manager@registration.test',
        status: 'ACTIVE',
      },
      {
        displayName: 'RC Executive',
        id: executiveUserId,
        primaryEmailNormalized: 'executive@registration.test',
        status: 'ACTIVE',
      },
    ]);
    const roles = await db
      .select({ code: schema.roles.code, id: schema.roles.id })
      .from(schema.roles);
    const managerRole = roles.find((role) => role.code === 'MANAGER');
    const executiveRole = roles.find((role) => role.code === 'RC_REGISTRATION_EXECUTIVE');
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
      displayName: 'Registration Customer',
      id: contactId,
      primaryPhoneE164: '+919900000010',
      primaryPhoneLookupHash: 'a'.repeat(64),
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
      vehicleInterest: 'Registration Test Vehicle',
    });
    await db
      .insert(schema.inventoryBrands)
      .values({ clientOrganizationId: tenantId, code: 'BRAND', id: brandId, name: 'Brand' });
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
    await db
      .insert(schema.inventoryColours)
      .values({ clientOrganizationId: tenantId, code: 'WHITE', id: colourId, name: 'White' });
    await db.insert(schema.inventoryUnits).values({
      branchId,
      clientOrganizationId: tenantId,
      colourId,
      createdByMembershipId: managerMembershipId,
      createdByUserId: managerUserId,
      engineNumber: 'REGENGINE001',
      id: unitId,
      ownershipType: 'DEALER_OWNED',
      status: delivered ? 'DELIVERED' : 'ALLOCATED',
      unitReference: 'REG-UNIT',
      variantId,
      vin: 'REGVIN00000000001',
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
      quotationReference: 'QT-REG',
      status: 'ACTIVE',
      totalMinor: 100_000,
      vehicleConfiguration: 'Registration Test Vehicle',
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
      vehicleConfiguration: 'Registration Test Vehicle',
      version: 1,
    });
    await db.insert(schema.bookings).values({
      bookingReference: 'BK-REG',
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
    if (delivered)
      await db.insert(schema.deliveryJobs).values({
        assignedMembershipId: executiveMembershipId,
        assignedUserId: executiveUserId,
        bookingId,
        branchId,
        clientOrganizationId: tenantId,
        contactId,
        createdByMembershipId: managerMembershipId,
        deliveredAt: new Date(),
        destinationAddress: 'Registration test address',
        id: deliveryId,
        inventoryUnitId: unitId,
        leadId,
        scheduledFor: new Date(),
        status: 'DELIVERED',
      });
    return {
      db,
      service: new RegistrationService(
        { db } as unknown as DatabaseConnection,
        new AuthorizationPolicy(),
        storage,
        cleanScanner,
      ),
    };
  }

  it('starts registration before delivery and never requires or rewrites a delivery job', async () => {
    const { db, service } = await setup(false);
    const created = await service.create(
      context(),
      {
        assigned_membership_id: executiveMembershipId,
        booking_id: bookingId,
        expected_completion_at: null,
      },
      'create-case',
      'correlation-create',
    );
    const started = await service.start(
      context({
        assignmentScope: 'ASSIGNED',
        membershipId: executiveMembershipId,
        roleCode: 'RC_REGISTRATION_EXECUTIVE',
        userId: executiveUserId,
      }),
      created.id,
      {
        application_started_at: new Date().toISOString(),
        document_checklist_confirmed: true,
        expected_version: created.version,
      },
      'start-case',
      'correlation-start',
    );
    assert.equal(started.status, 'REGISTRATION_STARTED');
    assert.equal((await db.select().from(schema.deliveryJobs)).length, 0);
  });

  it('creates a delivered dealership customer vehicle idempotently and blocks duplicate identity', async () => {
    const { service } = await setup(true);
    const first = await service.createDealershipVehicle(
      context(),
      { booking_id: bookingId },
      'vehicle-create',
      'correlation-vehicle',
    );
    const replay = await service.createDealershipVehicle(
      context(),
      { booking_id: bookingId },
      'vehicle-create',
      'correlation-vehicle',
    );
    assert.equal(replay.id, first.id);
    await assert.rejects(
      () =>
        service.createExternalVehicle(
          context(),
          {
            amc_expires_on: null,
            brand_name: 'Other',
            branch_id: branchId,
            contact_id: contactId,
            engine_number: null,
            insurance_expires_on: null,
            insurance_policy_number: null,
            model_name: 'Other',
            purchase_date: null,
            registration_number: null,
            rsa_expires_on: null,
            variant_name: 'Other',
            vin: 'REGVIN00000000001',
            warranty_expires_on: null,
          },
          'external-duplicate',
          'correlation-duplicate',
        ),
      /already exists|duplicated/u,
    );
  });

  it('keeps registration history immutable and correction events linked to the original event', async () => {
    const { db, service } = await setup(false);
    const created = await service.create(
      context(),
      {
        assigned_membership_id: executiveMembershipId,
        booking_id: bookingId,
        expected_completion_at: null,
      },
      'history-create',
      'correlation-history',
    );
    const [original] = await db
      .select()
      .from(schema.registrationEvents)
      .where(eq(schema.registrationEvents.registrationCaseId, created.id));
    assert.ok(original);
    await service.correct(
      context(),
      created.id,
      {
        application_number: 'APP-CORRECTED',
        corrected_event_id: original.id,
        expected_version: created.version,
        reason: 'Corrected data-entry error.',
      },
      'history-correct',
      'correlation-correct',
    );
    const correction = (
      await db
        .select()
        .from(schema.registrationEvents)
        .where(
          and(
            eq(schema.registrationEvents.registrationCaseId, created.id),
            eq(schema.registrationEvents.eventType, 'REGISTRATION_CORRECTION_RECORDED'),
          ),
        )
    )[0];
    assert.equal(correction?.correctsEventId, original.id);
    await assert.rejects(
      () =>
        db
          .update(schema.registrationEvents)
          .set({ reason: 'rewrite' })
          .where(eq(schema.registrationEvents.id, original.id)),
      (error: unknown) =>
        (error as { cause?: { message?: string } }).cause?.message?.includes('append-only') ===
        true,
    );
  });

  it('creates audited secure RC sharing evidence without exposing the storage key', async () => {
    const { db, service } = await setup(false);
    const created = await service.create(
      context(),
      {
        assigned_membership_id: executiveMembershipId,
        booking_id: bookingId,
        expected_completion_at: null,
      },
      'share-create',
      'correlation-share-create',
    );
    await db
      .update(schema.registrationCases)
      .set({
        applicationNumber: 'APP-1',
        permanentRegistrationNumber: 'MH12TEST0001',
        rcReceivedAt: new Date(),
        rtoCode: 'MH12',
        rtoSubmittedAt: new Date(),
        status: 'RC_RECEIVED',
        version: 2,
      })
      .where(eq(schema.registrationCases.id, created.id));
    const [document] = await db
      .insert(schema.rcDocuments)
      .values({
        checksumSha256: 'A'.repeat(43) + '=',
        clientOrganizationId: tenantId,
        contentLength: 10,
        contentType: 'application/pdf',
        fileName: 'rc.pdf',
        registrationCaseId: created.id,
        scannerStatus: 'CLEAN',
        status: 'VERIFIED',
        storageKey: `clients/${tenantId}/registration/${created.id}/rc/private`,
        uploadedAt: new Date(),
        uploadedByMembershipId: executiveMembershipId,
      })
      .returning();
    assert.ok(document);
    const shared = await service.share(
      context(),
      created.id,
      {
        delivery_mode: 'EMAIL',
        expected_version: 2,
        purpose: 'Customer RC delivery',
        recipient: 'customer@example.test',
      },
      'share-command',
      'correlation-share',
    );
    assert.equal(shared.download?.url, 'https://private.invalid/signed');
    assert.equal('storage_key' in shared, false);
    assert.equal((await db.select().from(schema.rcDeliveryRecords)).length, 1);
    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, 'RC_SHARED'));
    assert.equal(audit.length, 1);
  });

  it('hides cross-tenant cases as not found', async () => {
    const { service } = await setup(false);
    const created = await service.create(
      context(),
      {
        assigned_membership_id: executiveMembershipId,
        booking_id: bookingId,
        expected_completion_at: null,
      },
      'tenant-create',
      'correlation-tenant',
    );
    await assert.rejects(
      () => service.detail(context({ clientOrganizationId: otherTenantId }), created.id),
      /not found/u,
    );
  });
});
