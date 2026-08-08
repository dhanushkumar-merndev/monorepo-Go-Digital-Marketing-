import { describe, expect, it } from 'vitest';

import {
  TEST_RIDE_STATUS_CODES,
  completeTestRideRequestSchema,
  createTestRideRequestSchema,
  startTestRideRequestSchema,
  testRideLocationSampleSchema,
} from '../index.js';

const checklist = {
  customer_briefed: true,
  documents_verified: true,
  exterior_checked: true,
  fuel_or_charge_checked: true,
  interior_checked: true,
  safety_equipment_checked: true,
};

describe('Phase 6 test-ride contracts', () => {
  it('keeps the approved lifecycle exact and ordered', () => {
    expect(TEST_RIDE_STATUS_CODES).toEqual([
      'REQUESTED',
      'BOOKED',
      'CUSTOMER_CONFIRMED',
      'EXECUTIVE_ASSIGNED',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ]);
  });

  it('rejects a non-positive schedule window', () => {
    expect(
      createTestRideRequestSchema.safeParse({
        branch_id: '018f25a7-6dc0-7d4a-b7c6-6ba6f7446711',
        customer_location: 'Baner, Pune',
        demo_vehicle_reference: 'DEMO-01',
        lead_id: '018f25a7-6dc0-7d4a-b7c6-6ba6f7446712',
        scheduled_end_at: '2026-08-09T05:30:00.000Z',
        scheduled_start_at: '2026-08-09T05:30:00.000Z',
        vehicle_model: 'Model X',
      }).success,
    ).toBe(false);
  });

  it('requires explicit disclosure and the full start checklist', () => {
    expect(
      startTestRideRequestSchema.safeParse({
        checklist,
        disclosure_acknowledged: true,
        expected_version: 1,
        odometer_km: 10_000,
      }).success,
    ).toBe(true);
    expect(
      startTestRideRequestSchema.safeParse({
        checklist: { ...checklist, customer_briefed: false },
        disclosure_acknowledged: false,
        expected_version: 1,
        odometer_km: 10_000,
      }).success,
    ).toBe(false);
  });

  it('requires return evidence and feedback on completion', () => {
    const base = {
      checklist: { ...checklist, vehicle_returned: true },
      completion_evidence: 'Vehicle returned without new damage; customer signature captured.',
      end_odometer_km: 10_025,
      expected_version: 2,
      feedback: 'Customer liked the ride quality.',
    };
    expect(completeTestRideRequestSchema.safeParse(base).success).toBe(true);
    expect(
      completeTestRideRequestSchema.safeParse({
        ...base,
        checklist: { ...checklist, vehicle_returned: false },
      }).success,
    ).toBe(false);
  });

  it('bounds coordinates and requires a positive accuracy value', () => {
    expect(
      testRideLocationSampleSchema.safeParse({
        accuracy_m: 12,
        captured_at: '2026-08-09T05:45:00.000Z',
        idempotency_key: 'location-device-1-sequence-1',
        latitude: 18.559,
        longitude: 73.7868,
      }).success,
    ).toBe(true);
    expect(
      testRideLocationSampleSchema.safeParse({
        accuracy_m: 0,
        captured_at: '2026-08-09T05:45:00.000Z',
        idempotency_key: 'location-device-1-sequence-2',
        latitude: 100,
        longitude: 73.7868,
      }).success,
    ).toBe(false);
  });
});
