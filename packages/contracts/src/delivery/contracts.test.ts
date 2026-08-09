import { describe, expect, it } from 'vitest';

import {
  completeDeliveryRequestSchema,
  createDeliveryJobRequestSchema,
  initiateDeliveryProofUploadRequestSchema,
  recordDeliveryLocationsRequestSchema,
  requestDeliveryRescheduleSchema,
  updateDeliverySettingsRequestSchema,
} from './contracts.js';

const id = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446700';

describe('Phase 9 delivery contracts', () => {
  it('requires a canonical booking and bounded destination coordinates', () => {
    expect(
      createDeliveryJobRequestSchema.parse({
        booking_id: id,
        destination_address: 'Baner, Pune',
        destination_latitude: 18.559,
        destination_longitude: 73.7868,
        scheduled_for: '2026-09-15T11:00:00+05:30',
      }),
    ).toMatchObject({ booking_id: id, assigned_membership_id: null });
    expect(() =>
      createDeliveryJobRequestSchema.parse({
        booking_id: id,
        destination_address: 'Pune',
        destination_latitude: 100,
        scheduled_for: '2026-09-15T11:00:00+05:30',
      }),
    ).toThrow();
  });

  it('bounds offline location batches and requires per-sample idempotency', () => {
    expect(
      recordDeliveryLocationsRequestSchema.parse({
        samples: [
          {
            accuracy_m: 20,
            captured_at: '2026-09-15T11:00:00+05:30',
            idempotency_key: 'location-1',
            latitude: 18.559,
            longitude: 73.7868,
          },
        ],
      }).samples,
    ).toHaveLength(1);
    expect(() => recordDeliveryLocationsRequestSchema.parse({ samples: [] })).toThrow();
  });

  it('restricts private proof uploads to reviewed media types and checksums', () => {
    expect(
      initiateDeliveryProofUploadRequestSchema.parse({
        checksum_sha256: `${'A'.repeat(43)}=`,
        content_length: 2048,
        content_type: 'image/jpeg',
        file_name: 'handover.jpg',
        proof_type: 'PHOTO',
      }).proof_type,
    ).toBe('PHOTO');
    expect(() =>
      initiateDeliveryProofUploadRequestSchema.parse({
        checksum_sha256: 'bad',
        content_length: 2048,
        content_type: 'text/html',
        file_name: 'handover.html',
        proof_type: 'PHOTO',
      }),
    ).toThrow();
  });

  it('requires a reason and future-shaped timestamp for rescheduling', () => {
    expect(
      requestDeliveryRescheduleSchema.parse({
        expected_version: 2,
        reason: 'Customer requested a later handover.',
        requested_for: '2026-09-16T11:00:00+05:30',
      }).reason,
    ).toContain('Customer');
    expect(() =>
      requestDeliveryRescheduleSchema.parse({
        expected_version: 2,
        reason: '',
        requested_for: '2026-09-16T11:00:00+05:30',
      }),
    ).toThrow();
  });

  it('keeps completion minimal so the server derives checklist, proof and RC independence', () => {
    expect(completeDeliveryRequestSchema.parse({ expected_version: 7 })).toEqual({
      expected_version: 7,
      received_by: null,
    });
  });

  it('requires unique bounded tenant checklist and proof settings', () => {
    expect(
      updateDeliverySettingsRequestSchema.parse({
        active_timeout_minutes: 480,
        expected_version: 1,
        location_retention_days: 30,
        location_stale_seconds: 180,
        reason: 'Approved handover policy.',
        required_checklist_codes: ['PDI', 'DOCUMENTS'],
        required_proof_types: ['RECEIVED_BY'],
      }).required_checklist_codes,
    ).toEqual(['PDI', 'DOCUMENTS']);
    expect(() =>
      updateDeliverySettingsRequestSchema.parse({
        active_timeout_minutes: 480,
        expected_version: 1,
        location_retention_days: 30,
        location_stale_seconds: 180,
        reason: 'Duplicate is invalid.',
        required_checklist_codes: ['PDI', 'PDI'],
        required_proof_types: ['RECEIVED_BY'],
      }),
    ).toThrow();
  });
});
