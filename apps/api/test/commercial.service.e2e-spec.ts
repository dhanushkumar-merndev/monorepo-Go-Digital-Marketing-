import assert from 'node:assert/strict';
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { afterEach, describe, it } from 'node:test';
import { schema, type DatabaseConnection } from '@gdm/database';
import {
  createMigratedPGliteTestDatabase,
  type MigratedPGliteTestDatabase,
} from '@gdm/database/testing';
import { eq } from 'drizzle-orm';

import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import { CommercialService } from '../src/commercial/commercial.service.js';
import type { DocumentSecurityScanner } from '../src/commercial/document-security-scanner.port.js';
import type { ObjectStorage } from '../src/infrastructure/storage/object-storage.port.js';

const tenantId = 'c0000000-0000-4000-8000-000000000001';
const branchId = 'c1000000-0000-4000-8000-000000000001';
const otherBranchId = 'c1000000-0000-4000-8000-000000000002';
const userId = 'c2000000-0000-4000-8000-000000000001';
const membershipId = 'c3000000-0000-4000-8000-000000000001';
const contactId = 'c4000000-0000-4000-8000-000000000001';
const leadId = 'c5000000-0000-4000-8000-000000000001';

function context(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    assignmentScope: 'ALL',
    branchIds: new Set([branchId]),
    branchScopeMode: 'SELECTED',
    clientOrganizationId: tenantId,
    departmentIds: new Set(),
    departmentScopeMode: 'ALL',
    managedTeamIds: new Set(),
    membershipId,
    permissionCodes: new Set(),
    roleCode: 'MANAGER',
    sessionId: 'c6000000-0000-4000-8000-000000000001',
    teamIds: new Set(),
    teamScopeMode: 'ALL',
    userId,
    ...overrides,
  };
}

const unusedStorage: ObjectStorage = {
  createDownloadUrl: () => Promise.reject(new Error('Unexpected storage download.')),
  createUploadUrl: () => Promise.reject(new Error('Unexpected storage upload.')),
  stat: () => Promise.reject(new Error('Unexpected storage stat.')),
};
const cleanScanner: DocumentSecurityScanner = { scan: () => Promise.resolve('CLEAN') };

describe('Phase 8 commercial service integration', () => {
  let database: MigratedPGliteTestDatabase | undefined;

  afterEach(async () => {
    await database?.close();
    database = undefined;
  });

  async function setup() {
    database = await createMigratedPGliteTestDatabase();
    const db = database.db;
    const agencyId = 'ca000000-0000-4000-8000-000000000001';
    await db.insert(schema.agencies).values({
      code: 'COMMERCIAL_TEST',
      displayName: 'Commercial Test',
      id: agencyId,
      legalName: 'Commercial Test Private Limited',
    });
    await db.insert(schema.clientOrganizations).values({
      agencyId,
      code: 'COMMERCIAL_A',
      displayName: 'Commercial A',
      id: tenantId,
      legalName: 'Commercial A Motors',
      status: 'ACTIVE',
    });
    await db.insert(schema.branches).values([
      { clientOrganizationId: tenantId, code: 'MAIN', id: branchId, name: 'Main Branch' },
      { clientOrganizationId: tenantId, code: 'OTHER', id: otherBranchId, name: 'Other Branch' },
    ]);
    await db.insert(schema.users).values({
      displayName: 'Commercial Manager',
      id: userId,
      primaryEmailNormalized: 'manager@commercial.test',
      status: 'ACTIVE',
    });
    const [managerRole] = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.code, 'MANAGER'));
    assert.ok(managerRole);
    await db.insert(schema.memberships).values({
      assignmentScope: 'ALL',
      branchScopeMode: 'SELECTED',
      clientOrganizationId: tenantId,
      contextType: 'CLIENT',
      departmentScopeMode: 'ALL',
      id: membershipId,
      roleId: managerRole.id,
      status: 'ACTIVE',
      teamScopeMode: 'ALL',
      userId,
    });
    await db.insert(schema.membershipBranchScopes).values({
      branchId,
      clientOrganizationId: tenantId,
      membershipId,
    });
    await db.insert(schema.contacts).values({
      clientOrganizationId: tenantId,
      displayName: 'Commercial Customer',
      id: contactId,
      primaryPhoneE164: '+919900000001',
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
      vehicleInterest: 'Commercial Test Vehicle',
    });
    await db.insert(schema.commercialSettings).values({
      clientOrganizationId: tenantId,
      currency: 'INR',
      deliveryPaymentGateBasisPoints: 10_000,
      discountApprovalThresholdMinor: 10_000,
      requireFinanceDisbursement: true,
      requireInsurance: true,
      requireInvoice: true,
      requiredDocumentTypes: ['BOOKING_FORM'],
      updatedByMembershipId: membershipId,
    });
    return {
      db,
      service: new CommercialService(
        { db } as unknown as DatabaseConnection,
        new AuthorizationPolicy(),
        unusedStorage,
        cleanScanner,
      ),
    };
  }

  async function createBooking(service: CommercialService, suffix: string) {
    const quotation = await service.createQuotation(
      context(),
      {
        branch_id: branchId,
        contact_id: contactId,
        currency: 'INR',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        lead_id: leadId,
        notes: null,
        price_components: [
          { amount_minor: 100_000, category: 'EX_SHOWROOM', code: 'BASE', label: 'Base' },
        ],
        quotation_reference: `QT-${suffix}`,
        vehicle_configuration: 'Commercial Test Vehicle',
      },
      `quote-${suffix}`,
      `corr-quote-${suffix}`,
    );
    return service.createBooking(
      context(),
      {
        booking_reference: `BK-${suffix}`,
        customer_confirmed_at: new Date().toISOString(),
        expected_delivery_at: null,
        payment_type: 'FULL',
        quotation_id: quotation.id,
        quotation_version: quotation.version,
      },
      `booking-${suffix}`,
      `corr-booking-${suffix}`,
    );
  }

  it('requires approval above the configured discount threshold', async () => {
    const { service } = await setup();
    const quotation = await service.createQuotation(
      context(),
      {
        branch_id: branchId,
        contact_id: contactId,
        currency: 'INR',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        lead_id: leadId,
        notes: null,
        price_components: [
          { amount_minor: 100_000, category: 'EX_SHOWROOM', code: 'BASE', label: 'Base' },
          { amount_minor: 10_001, category: 'DISCOUNT', code: 'DISC', label: 'Discount' },
        ],
        quotation_reference: 'QT-APPROVAL',
        vehicle_configuration: 'Commercial Test Vehicle',
      },
      'quote-approval',
      'corr-quote-approval',
    );
    assert.equal(quotation.approval_status, 'PENDING');
    assert.equal(quotation.status, 'DRAFT');
    const approved = await service.decideDiscount(
      context(),
      quotation.id,
      { decision: 'APPROVED', expected_quotation_version: 1, reason: 'Manager approved.' },
      'approve-discount',
      'corr-approve-discount',
    );
    assert.equal(approved.status, 'ACTIVE');
  });

  it('does not count unverified proof and rejects an overpayment verification', async () => {
    const { service } = await setup();
    const booking = await createBooking(service, 'PAYMENT');
    const first = await service.createPayment(
      context(),
      booking.booking_id,
      {
        amount_minor: 80_000,
        currency: 'INR',
        method: 'UPI',
        payment_reference: 'PAY-FIRST',
        proof_document_version_id: null,
        received_at: new Date().toISOString(),
      },
      'payment-first',
      'corr-payment-first',
    );
    const pendingDetail = await service.bookingDetail(context(), booking.booking_id);
    assert.equal(pendingDetail.verified_paid_minor, 0);
    await service.verifyPayment(
      context(),
      first.id,
      { decision: 'VERIFIED', reason: 'Bank receipt matched.' },
      'verify-first',
      'corr-verify-first',
    );
    const second = await service.createPayment(
      context(),
      booking.booking_id,
      {
        amount_minor: 30_000,
        currency: 'INR',
        method: 'UPI',
        payment_reference: 'PAY-SECOND',
        proof_document_version_id: null,
        received_at: new Date().toISOString(),
      },
      'payment-second',
      'corr-payment-second',
    );
    await assert.rejects(
      service.verifyPayment(
        context(),
        second.id,
        { decision: 'VERIFIED', reason: 'Would exceed balance.' },
        'verify-second',
        'corr-verify-second',
      ),
      (error: unknown) => JSON.stringify(error).includes('BALANCE_NEGATIVE'),
    );
  });

  it('preserves correction history with a linked reversal', async () => {
    const { db, service } = await setup();
    const booking = await createBooking(service, 'REVERSAL');
    const payment = await service.createPayment(
      context(),
      booking.booking_id,
      {
        amount_minor: 100_000,
        currency: 'INR',
        method: 'BANK_TRANSFER',
        payment_reference: 'PAY-REVERSAL',
        proof_document_version_id: null,
        received_at: new Date().toISOString(),
      },
      'payment-reversal',
      'corr-payment-reversal',
    );
    await service.verifyPayment(
      context(),
      payment.id,
      { decision: 'VERIFIED', reason: 'Matched.' },
      'verify-reversal',
      'corr-verify-reversal',
    );
    const reversal = await service.reversePayment(
      context(),
      payment.id,
      { reason: 'Receipt posted to the wrong booking.' },
      'reverse-payment',
      'corr-reverse-payment',
    );
    const rows = await db
      .select()
      .from(schema.paymentEntries)
      .where(eq(schema.paymentEntries.bookingId, booking.booking_id));
    assert.equal(rows.length, 2);
    assert.equal(rows.find((row) => row.id === reversal.reversal_id)?.originalEntryId, payment.id);
    const detail = await service.bookingDetail(context(), booking.booking_id);
    assert.equal(detail.verified_paid_minor, 0);
  });

  it('fails delivery readiness closed when canonical dependencies are incomplete', async () => {
    const { service } = await setup();
    const booking = await createBooking(service, 'READINESS');
    const readiness = await service.evaluateReadiness(
      context(),
      booking.booking_id,
      'corr-readiness',
    );
    assert.equal(readiness.ready, false);
    assert.ok(readiness.items.some((item) => item.blocking && !item.complete));
    await assert.rejects(
      service.bookingDetail(context({ branchIds: new Set([otherBranchId]) }), booking.booking_id),
    );
  });
});
