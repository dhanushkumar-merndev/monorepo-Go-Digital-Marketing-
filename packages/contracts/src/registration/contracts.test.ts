import { describe, expect, it } from 'vitest';

import {
  allotRegistrationNumberRequestSchema,
  createExternalCustomerVehicleRequestSchema,
  registrationListQuerySchema,
  shareRcRequestSchema,
} from './contracts.js';

describe('Phase 10 registration contracts', () => {
  it('parses false query strings without treating them as truthy', () => {
    expect(
      registrationListQuerySchema.parse({ assigned_to_me: 'false', overdue_only: 'false' }),
    ).toMatchObject({ assigned_to_me: false, overdue_only: false });
  });

  it('requires temporary or permanent number evidence for allotment', () => {
    const result = allotRegistrationNumberRequestSchema.safeParse({
      allotted_at: '2026-08-09T12:00:00.000Z',
      evidence_reference: 'RTO receipt',
      expected_version: 1,
      permanent_registration_number: null,
      temporary_registration_number: null,
    });
    expect(result.success).toBe(false);
  });

  it('requires an explicit audited RC delivery mode and recipient', () => {
    expect(
      shareRcRequestSchema.parse({
        delivery_mode: 'EMAIL',
        expected_version: 4,
        purpose: 'Customer RC delivery',
        recipient: 'customer@example.test',
      }),
    ).toMatchObject({ delivery_mode: 'EMAIL' });
  });

  it('does not accept dealership lineage on the external vehicle contract', () => {
    const result = createExternalCustomerVehicleRequestSchema.safeParse({
      amc_expires_on: null,
      booking_id: 'a0000000-0000-4000-8000-000000000001',
      branch_id: 'a0000000-0000-4000-8000-000000000002',
      brand_name: 'External Brand',
      contact_id: 'a0000000-0000-4000-8000-000000000003',
      engine_number: null,
      insurance_expires_on: null,
      insurance_policy_number: null,
      model_name: 'External Model',
      purchase_date: null,
      registration_number: 'MH12TEST1000',
      rsa_expires_on: null,
      variant_name: 'External Variant',
      vin: null,
      warranty_expires_on: null,
    });
    expect(result.success).toBe(true);
    if (result.success) expect('booking_id' in result.data).toBe(false);
  });
});
