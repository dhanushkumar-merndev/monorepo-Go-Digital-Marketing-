import { z } from 'zod';

const idSchema = z.uuid();
const nonBlank = (maximum: number) => z.string().trim().min(1).max(maximum);

export const DELIVERY_STATUS_CODES = [
  'VEHICLE_ALLOCATED',
  'VEHICLE_PREPARATION',
  'READY_FOR_DELIVERY',
  'DELIVERY_SCHEDULED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELAYED',
  'FAILED',
  'RESCHEDULED',
  'CANCELLED',
] as const;

export const DELIVERY_CHECKLIST_CODES = [
  'ACCESSORIES',
  'PDI',
  'DOCUMENTS',
  'FUEL_OR_CHARGE',
  'BATTERY',
  'EXTERIOR_CONDITION',
  'INTERIOR_CONDITION',
] as const;

export const DELIVERY_PROOF_TYPES = ['OTP', 'SIGNATURE', 'PHOTO', 'RECEIVED_BY'] as const;

export const deliveryStatusSchema = z.enum(DELIVERY_STATUS_CODES);
export const deliveryChecklistCodeSchema = z.enum(DELIVERY_CHECKLIST_CODES);
export const deliveryProofTypeSchema = z.enum(DELIVERY_PROOF_TYPES);

export const deliveryListQuerySchema = z.object({
  assigned_to_me: z.coerce.boolean().default(false),
  date: z.iso.date().optional(),
  exception_only: z.coerce.boolean().default(false),
  from_date: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
  status: deliveryStatusSchema.optional(),
});

export const createDeliveryJobRequestSchema = z.object({
  assigned_membership_id: idSchema.nullable().default(null),
  booking_id: idSchema,
  destination_address: nonBlank(500),
  destination_latitude: z.number().finite().min(-90).max(90).nullable().default(null),
  destination_longitude: z.number().finite().min(-180).max(180).nullable().default(null),
  scheduled_for: z.iso.datetime({ offset: true }),
});

export const assignDeliveryRequestSchema = z.object({
  assigned_membership_id: idSchema,
  expected_version: z.number().int().min(1),
  reason: nonBlank(500),
});

export const updateDeliveryChecklistRequestSchema = z.object({
  checked: z.boolean(),
  code: deliveryChecklistCodeSchema,
  expected_version: z.number().int().min(1),
  note: z.string().trim().max(1000).nullable().default(null),
});

export const markDeliveryReadyRequestSchema = z.object({
  expected_version: z.number().int().min(1),
});

export const scheduleDeliveryRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  scheduled_for: z.iso.datetime({ offset: true }),
});

export const startDeliveryRequestSchema = z.object({
  disclosure_acknowledged: z.literal(true),
  expected_version: z.number().int().min(1),
});

export const deliveryLocationSampleSchema = z.object({
  accuracy_m: z.number().finite().positive().max(10_000),
  captured_at: z.iso.datetime({ offset: true }),
  idempotency_key: nonBlank(128),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export const recordDeliveryLocationsRequestSchema = z.object({
  samples: z.array(deliveryLocationSampleSchema).min(1).max(100),
});

export const recordReceivedByProofRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  received_by: nonBlank(160),
});

export const initiateDeliveryProofUploadRequestSchema = z.object({
  checksum_sha256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/u),
  content_length: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  content_type: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
  file_name: nonBlank(240),
  proof_type: z.enum(['SIGNATURE', 'PHOTO']),
});

export const completeDeliveryProofUploadRequestSchema = z.object({
  checksum_sha256: z.string().regex(/^[A-Za-z0-9+/]{43}=$/u),
  expected_version: z.number().int().min(1),
  proof_id: idSchema,
});

export const reviewDeliveryProofRequestSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED']),
  reason: nonBlank(1000),
});

export const requestDeliveryOtpRequestSchema = z.object({
  expected_version: z.number().int().min(1),
});

export const verifyDeliveryOtpRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/u),
  expected_version: z.number().int().min(1),
});

export const completeDeliveryRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  received_by: nonBlank(160).nullable().default(null),
});

export const deliveryExceptionRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  reason: nonBlank(1000),
});

export const requestDeliveryRescheduleSchema = z.object({
  expected_version: z.number().int().min(1),
  reason: nonBlank(1000),
  requested_for: z.iso.datetime({ offset: true }),
});

export const decideDeliveryRescheduleSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  expected_version: z.number().int().min(1),
  reason: nonBlank(1000),
});

export const deliveryProofDownloadQuerySchema = z.object({
  purpose: nonBlank(500),
});

export const updateDeliverySettingsRequestSchema = z.object({
  active_timeout_minutes: z.number().int().min(30).max(1440),
  expected_version: z.number().int().min(1),
  location_retention_days: z.number().int().min(1).max(365),
  location_stale_seconds: z.number().int().min(60).max(1800),
  reason: nonBlank(1000),
  required_checklist_codes: z
    .array(deliveryChecklistCodeSchema)
    .min(1)
    .refine((values) => new Set(values).size === values.length, 'Checklist codes must be unique.'),
  required_proof_types: z
    .array(deliveryProofTypeSchema)
    .min(1)
    .refine((values) => new Set(values).size === values.length, 'Proof types must be unique.'),
});

export const deliverySummarySchema = z.object({
  assigned_membership_id: idSchema.nullable(),
  assigned_name: z.string().nullable(),
  booking_id: idSchema,
  booking_reference: z.string(),
  branch_id: idSchema,
  contact_id: idSchema,
  customer_name: z.string(),
  destination_address: z.string(),
  destination_latitude: z.number().nullable(),
  destination_longitude: z.number().nullable(),
  id: idSchema,
  inventory_unit_id: idSchema,
  last_location: z
    .object({
      accuracy_m: z.number(),
      captured_at: z.iso.datetime(),
      latitude: z.number(),
      longitude: z.number(),
      stale: z.boolean(),
    })
    .nullable(),
  lead_id: idSchema,
  phone_e164: z.string(),
  scheduled_for: z.iso.datetime(),
  status: deliveryStatusSchema,
  tracking_active: z.boolean(),
  vehicle_label: z.string(),
  version: z.number().int().min(1),
});

export type AssignDeliveryRequest = z.infer<typeof assignDeliveryRequestSchema>;
export type CompleteDeliveryProofUploadRequest = z.infer<
  typeof completeDeliveryProofUploadRequestSchema
>;
export type CompleteDeliveryRequest = z.infer<typeof completeDeliveryRequestSchema>;
export type CreateDeliveryJobRequest = z.infer<typeof createDeliveryJobRequestSchema>;
export type DecideDeliveryReschedule = z.infer<typeof decideDeliveryRescheduleSchema>;
export type DeliveryExceptionRequest = z.infer<typeof deliveryExceptionRequestSchema>;
export type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;
export type DeliveryProofType = z.infer<typeof deliveryProofTypeSchema>;
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;
export type DeliverySummary = z.infer<typeof deliverySummarySchema>;
export type InitiateDeliveryProofUploadRequest = z.infer<
  typeof initiateDeliveryProofUploadRequestSchema
>;
export type MarkDeliveryReadyRequest = z.infer<typeof markDeliveryReadyRequestSchema>;
export type RecordDeliveryLocationsRequest = z.infer<typeof recordDeliveryLocationsRequestSchema>;
export type RecordReceivedByProofRequest = z.infer<typeof recordReceivedByProofRequestSchema>;
export type RequestDeliveryOtpRequest = z.infer<typeof requestDeliveryOtpRequestSchema>;
export type RequestDeliveryReschedule = z.infer<typeof requestDeliveryRescheduleSchema>;
export type ReviewDeliveryProofRequest = z.infer<typeof reviewDeliveryProofRequestSchema>;
export type ScheduleDeliveryRequest = z.infer<typeof scheduleDeliveryRequestSchema>;
export type StartDeliveryRequest = z.infer<typeof startDeliveryRequestSchema>;
export type UpdateDeliveryChecklistRequest = z.infer<typeof updateDeliveryChecklistRequestSchema>;
export type UpdateDeliverySettingsRequest = z.infer<typeof updateDeliverySettingsRequestSchema>;
export type VerifyDeliveryOtpRequest = z.infer<typeof verifyDeliveryOtpRequestSchema>;
