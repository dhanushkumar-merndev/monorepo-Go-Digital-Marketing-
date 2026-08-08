import { describe, expect, it } from 'vitest';
import {
  createInventoryAllocationRequestSchema,
  createInventoryReservationRequestSchema,
  createInventoryUnitRequestSchema,
  transitionInventoryUnitRequestSchema,
} from './contracts.js';

describe('inventory contracts', () => {
  it('normalizes physical identifiers and requires identities for available stock', () => {
    const parsed = createInventoryUnitRequestSchema.parse({
      branch_id: 'a1000000-0000-4000-8000-000000000001',
      chassis_number: ' chassis 01 ',
      colour_id: 'a4000000-0000-4000-8000-000000000004',
      ownership_type: 'DEALER_OWNED',
      status: 'AVAILABLE',
      unit_reference: 'UNIT-1',
      variant_id: 'a4000000-0000-4000-8000-000000000003',
      vin: ' vin 0001 ',
    });
    expect(parsed.vin).toBe('VIN0001');
    expect(parsed.chassis_number).toBe('CHASSIS01');
    expect(
      createInventoryUnitRequestSchema.safeParse({
        branch_id: parsed.branch_id,
        colour_id: parsed.colour_id,
        ownership_type: 'DEALER_OWNED',
        status: 'AVAILABLE',
        unit_reference: 'UNIT-2',
        variant_id: parsed.variant_id,
      }).success,
    ).toBe(false);
  });

  it('requires reservation context, allocation readiness and reasoned controlled transitions', () => {
    expect(
      createInventoryReservationRequestSchema.safeParse({
        expected_version: 1,
        expires_at: '2026-09-01T10:00:00+05:30',
        reason: 'Hold',
      }).success,
    ).toBe(false);
    expect(
      createInventoryAllocationRequestSchema.safeParse({
        booking_reference: 'BOOKING-1',
        expected_version: 1,
        readiness_asserted: false,
        reason: 'Not ready',
      }).success,
    ).toBe(false);
    expect(
      transitionInventoryUnitRequestSchema.parse({
        action: 'AUTHORIZE_DEMO_SALE',
        expected_version: 2,
        reason: 'Manager-approved sale conversion.',
      }).action,
    ).toBe('AUTHORIZE_DEMO_SALE');
  });

  it('normalizes identifiers supplied when an expected unit is received', () => {
    const parsed = transitionInventoryUnitRequestSchema.parse({
      action: 'RECEIVE',
      chassis_number: ' chassis later ',
      expected_version: 1,
      reason: 'Vehicle reached the receiving bay.',
      vin: ' vin later ',
    });
    expect(parsed.chassis_number).toBe('CHASSISLATER');
    expect(parsed.vin).toBe('VINLATER');
  });
});
