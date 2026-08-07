import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isAllowedLeadTransition } from '../src/leads/lead-lifecycle.js';
import { normalizeIndianPhone, phoneLookupHash } from '../src/leads/phone-normalizer.js';
import { businessSlaDeadline } from '../src/leads/sla-calculator.js';

describe('Phase 3 lead domain rules', () => {
  it('normalizes Indian mobile numbers and creates tenant-specific lookup hashes', () => {
    assert.equal(normalizeIndianPhone('09876 543 210'), '+919876543210');
    assert.equal(normalizeIndianPhone('+91-98765-43210'), '+919876543210');
    assert.equal(normalizeIndianPhone('12345'), null);
    assert.notEqual(
      phoneLookupHash('tenant-a', '+919876543210', 'test-pepper-value'),
      phoneLookupHash('tenant-b', '+919876543210', 'test-pepper-value'),
    );
  });

  it('keeps rejected and lost distinct and rejects invalid lifecycle shortcuts', () => {
    assert.equal(isAllowedLeadTransition('PENDING_REVIEW', 'REJECTED'), true);
    assert.equal(isAllowedLeadTransition('PENDING_REVIEW', 'LOST'), false);
    assert.equal(isAllowedLeadTransition('LOST', 'REOPENED'), true);
    assert.equal(isAllowedLeadTransition('REJECTED', 'REOPENED'), true);
    assert.equal(isAllowedLeadTransition('ACCEPTED', 'BOOKING_CONFIRMED'), false);
  });

  it('calculates an outside-hours SLA deterministically in branch local time', () => {
    const schedule = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      closesAt: dayOfWeek === 0 ? null : '18:00',
      dayOfWeek,
      isClosed: dayOfWeek === 0,
      opensAt: dayOfWeek === 0 ? null : '09:00',
    }));
    const due = businessSlaDeadline(
      new Date('2026-08-08T15:00:00.000Z'),
      15,
      'Asia/Kolkata',
      schedule,
    );
    assert.equal(due.toISOString(), '2026-08-10T03:45:00.000Z');
  });
});
