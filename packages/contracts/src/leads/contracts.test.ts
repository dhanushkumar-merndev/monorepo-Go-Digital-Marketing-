import { describe, expect, it } from 'vitest';

import {
  LEAD_SOURCE_CODES,
  LOST_REASONS,
  REJECTION_REASONS,
  createLeadRequestSchema,
  leadTransitionRequestSchema,
  publicLeadFormRequestSchema,
} from '../index.js';

const base = {
  campaign: { page_url: 'https://dealer.example/cars/model-x' },
  consent: {
    evidence: 'Customer selected the consent checkbox on the published form.',
    granted: true,
    notice_version: 'lead-response-v1',
    purpose: 'LEAD_RESPONSE',
  },
  name: 'Test Customer',
  phone: '9876543210',
  source: 'WEBSITE',
  vehicle_interest: 'Model X',
};

describe('Phase 3 lead contracts', () => {
  it('keeps the approved sources and distinct rejection/lost reason sets exact', () => {
    expect(LEAD_SOURCE_CODES).toEqual([
      'META',
      'WHATSAPP_AD',
      'GOOGLE_ADS',
      'WEBSITE',
      'WALK_IN',
      'OTHER',
    ]);
    expect(REJECTION_REASONS).toContain('DUPLICATE');
    expect(REJECTION_REASONS).not.toContain('PRICE');
    expect(LOST_REASONS).toContain('PRICE');
    expect(LOST_REASONS).not.toContain('DUPLICATE');
  });

  it('treats manual entry independently from source and requires detail for OTHER', () => {
    expect(
      createLeadRequestSchema.safeParse({
        ...base,
        branch_id: '018f25a7-6dc0-7d4a-b7c6-6ba6f7446711',
        source: 'OTHER',
      }).success,
    ).toBe(false);
    expect(
      createLeadRequestSchema.safeParse({
        ...base,
        branch_id: '018f25a7-6dc0-7d4a-b7c6-6ba6f7446711',
        source: 'WALK_IN',
      }).success,
    ).toBe(true);
  });

  it('does not permit a public caller to supply a tenant branch identifier', () => {
    expect(publicLeadFormRequestSchema.safeParse(base).success).toBe(true);
    expect(
      publicLeadFormRequestSchema.safeParse({
        ...base,
        branch_id: '018f25a7-6dc0-7d4a-b7c6-6ba6f7446711',
      }).success,
    ).toBe(true);
    expect(
      publicLeadFormRequestSchema.parse({
        ...base,
        branch_id: '018f25a7-6dc0-7d4a-b7c6-6ba6f7446711',
      }),
    ).not.toHaveProperty('branch_id');
  });

  it('requires outcome evidence and a reason specific to rejection or loss', () => {
    expect(
      leadTransitionRequestSchema.safeParse({
        expected_version: 1,
        note: 'Rejected by staff.',
        to_status: 'REJECTED',
      }).success,
    ).toBe(false);
    expect(
      leadTransitionRequestSchema.safeParse({
        expected_version: 1,
        lost_reason: 'PRICE',
        note: 'Customer chose another budget.',
        to_status: 'LOST',
      }).success,
    ).toBe(true);
  });
});
