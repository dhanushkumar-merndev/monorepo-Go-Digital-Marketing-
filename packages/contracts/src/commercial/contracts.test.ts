import { describe, expect, it } from 'vitest';

import {
  completeCommercialDocumentUploadRequestSchema,
  createFinanceCaseRequestSchema,
  createPaymentEntryRequestSchema,
  createQuotationRequestSchema,
  decideFinanceCaseRequestSchema,
  initiateCommercialDocumentUploadRequestSchema,
} from './contracts.js';

describe('Phase 8 commercial contracts', () => {
  it('keeps currency amounts in bounded integer minor units', () => {
    const payment = createPaymentEntryRequestSchema.safeParse({
      amount_minor: 12.5,
      currency: 'INR',
      method: 'UPI',
      payment_reference: 'PAY-1',
      proof_document_version_id: null,
      received_at: '2026-08-09T10:00:00+05:30',
    });
    expect(payment.success).toBe(false);
  });

  it('requires a sanctioned amount for finance approval', () => {
    expect(
      decideFinanceCaseRequestSchema.safeParse({
        decision: 'APPROVED',
        expected_version: 1,
        provider_reference: 'BANK-1',
        reason: 'Approved',
        sanctioned_amount_minor: null,
      }).success,
    ).toBe(false);
  });

  it('keeps finance application distinct from a later decision', () => {
    expect(
      createFinanceCaseRequestSchema.parse({
        applied_amount_minor: 100_000,
        currency: 'INR',
        down_payment_minor: 10_000,
        partner_name: 'Example Bank',
        provider_reference: null,
      }),
    ).not.toHaveProperty('decision');
  });

  it('validates private upload types, sizes and checksums', () => {
    const parsed = initiateCommercialDocumentUploadRequestSchema.safeParse({
      booking_id: '00000000-0000-4000-8000-000000000001',
      checksum_sha256: 'a'.repeat(64),
      content_length: 20 * 1024 * 1024 + 1,
      content_type: 'application/pdf',
      document_type: 'BOOKING_FORM',
      expires_at: null,
      file_name: 'booking.pdf',
      preferred_delivery_channel: null,
    });
    expect(parsed.success).toBe(false);
    expect(completeCommercialDocumentUploadRequestSchema.parse({ checksum_sha256: null })).toEqual({
      checksum_sha256: null,
    });
  });

  it('accepts explicit reduction components without allowing negative input amounts', () => {
    const result = createQuotationRequestSchema.safeParse({
      branch_id: '00000000-0000-4000-8000-000000000001',
      contact_id: '00000000-0000-4000-8000-000000000002',
      currency: 'INR',
      expires_at: '2026-08-10T10:00:00+05:30',
      lead_id: '00000000-0000-4000-8000-000000000003',
      notes: null,
      price_components: [
        { amount_minor: -1, category: 'DISCOUNT', code: 'DISC', label: 'Discount' },
      ],
      quotation_reference: 'QT-1',
      vehicle_configuration: 'Example vehicle',
    });
    expect(result.success).toBe(false);
  });
});
