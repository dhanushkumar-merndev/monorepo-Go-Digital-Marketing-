import { z } from 'zod';

const idSchema = z.uuid();
const nonBlank = (maximum: number) => z.string().trim().min(1).max(maximum);
const odometerSchema = z.number().int().min(0).max(2_000_000);

export const TEST_RIDE_STATUS_CODES = [
  'REQUESTED',
  'BOOKED',
  'CUSTOMER_CONFIRMED',
  'EXECUTIVE_ASSIGNED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

export const testRideStatusSchema = z.enum(TEST_RIDE_STATUS_CODES);
export const testRideTerminalReasonSchema = z.enum([
  'CUSTOMER_CANCELLED',
  'CUSTOMER_UNAVAILABLE',
  'VEHICLE_UNAVAILABLE',
  'EXECUTIVE_UNAVAILABLE',
  'WEATHER_OR_SAFETY',
  'DUPLICATE_REQUEST',
  'OTHER',
]);

export const testRideChecklistSchema = z.object({
  customer_briefed: z.boolean(),
  documents_verified: z.boolean(),
  exterior_checked: z.boolean(),
  fuel_or_charge_checked: z.boolean(),
  interior_checked: z.boolean(),
  safety_equipment_checked: z.boolean(),
  vehicle_returned: z.boolean().optional(),
});

export const createTestRideRequestSchema = z
  .object({
    branch_id: idSchema,
    customer_location: nonBlank(500),
    demo_vehicle_reference: nonBlank(100),
    lead_id: idSchema,
    notes: z.string().trim().max(2000).nullable().default(null),
    otp_code: z
      .string()
      .regex(/^\d{4,8}$/u)
      .nullable()
      .default(null),
    scheduled_end_at: z.iso.datetime({ offset: true }),
    scheduled_start_at: z.iso.datetime({ offset: true }),
    vehicle_model: nonBlank(240),
  })
  .superRefine((value, context) => {
    if (Date.parse(value.scheduled_end_at) <= Date.parse(value.scheduled_start_at)) {
      context.addIssue({
        code: 'custom',
        message: 'Scheduled end must be after the scheduled start.',
        path: ['scheduled_end_at'],
      });
    }
  });

export const bookTestRideRequestSchema = z.object({
  expected_version: z.number().int().min(1),
});

export const confirmTestRideRequestSchema = z.object({
  channel: z.enum(['CALL', 'WHATSAPP', 'EMAIL', 'IN_PERSON', 'OTHER']),
  confirmed_at: z.iso.datetime({ offset: true }),
  expected_version: z.number().int().min(1),
});

export const assignTestRideRequestSchema = z.object({
  executive_membership_id: idSchema,
  expected_version: z.number().int().min(1),
  reason: nonBlank(500),
});

export const startTestRideRequestSchema = z.object({
  checklist: testRideChecklistSchema.omit({ vehicle_returned: true }),
  disclosure_acknowledged: z.literal(true),
  expected_version: z.number().int().min(1),
  odometer_km: odometerSchema,
  otp_code: z
    .string()
    .regex(/^\d{4,8}$/u)
    .nullable()
    .default(null),
});

export const testRideLocationSampleSchema = z.object({
  accuracy_m: z.number().finite().positive().max(10_000),
  captured_at: z.iso.datetime({ offset: true }),
  idempotency_key: nonBlank(128),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export const recordTestRideLocationsRequestSchema = z.object({
  samples: z.array(testRideLocationSampleSchema).min(1).max(100),
});

export const stopTestRideTrackingRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  reason: z.enum(['MANUAL_STOP', 'PERMISSION_REVOKED', 'TIMEOUT']),
});

export const completeTestRideRequestSchema = z.object({
  checklist: testRideChecklistSchema.extend({ vehicle_returned: z.literal(true) }),
  completion_evidence: nonBlank(2000),
  end_odometer_km: odometerSchema,
  expected_version: z.number().int().min(1),
  feedback: nonBlank(4000),
});

export const endTestRideRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  note: nonBlank(1000),
  reason: testRideTerminalReasonSchema,
});

export const testRideListQuerySchema = z.object({
  assigned_to_me: z.coerce.boolean().default(false),
  date: z.iso.date().optional(),
  from_date: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
  status: testRideStatusSchema.optional(),
});

export const testRideSummarySchema = z.object({
  branch_id: idSchema,
  contact_id: idSchema,
  contact_name: z.string(),
  customer_location: z.string(),
  demo_vehicle_reference: z.string(),
  executive_membership_id: idSchema.nullable(),
  executive_name: z.string().nullable(),
  executive_user_id: idSchema.nullable(),
  id: idSchema,
  inventory_unit_id: idSchema.nullable().default(null),
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
  scheduled_end_at: z.iso.datetime(),
  scheduled_start_at: z.iso.datetime(),
  status: testRideStatusSchema,
  tracking_active: z.boolean(),
  vehicle_model: z.string(),
  version: z.number().int().min(1),
});

export const testRideDetailSchema = z.object({
  events: z.array(
    z.object({
      actor_name: z.string().nullable(),
      created_at: z.iso.datetime(),
      event_type: z.string(),
      from_status: testRideStatusSchema.nullable(),
      id: idSchema,
      reason: z.string().nullable(),
      to_status: testRideStatusSchema.nullable(),
    }),
  ),
  ride: testRideSummarySchema.extend({
    cancellation_reason: z.string().nullable(),
    completion_evidence: z.string().nullable(),
    confirmed_at: z.iso.datetime().nullable(),
    end_odometer_km: odometerSchema.nullable(),
    feedback: z.string().nullable(),
    no_show_reason: z.string().nullable(),
    notes: z.string().nullable(),
    otp_required: z.boolean(),
    start_odometer_km: odometerSchema.nullable(),
    tracking_expires_at: z.iso.datetime().nullable(),
  }),
});

export type AssignTestRideRequest = z.infer<typeof assignTestRideRequestSchema>;
export type BookTestRideRequest = z.infer<typeof bookTestRideRequestSchema>;
export type CompleteTestRideRequest = z.infer<typeof completeTestRideRequestSchema>;
export type ConfirmTestRideRequest = z.infer<typeof confirmTestRideRequestSchema>;
export type CreateTestRideRequest = z.infer<typeof createTestRideRequestSchema>;
export type EndTestRideRequest = z.infer<typeof endTestRideRequestSchema>;
export type RecordTestRideLocationsRequest = z.infer<typeof recordTestRideLocationsRequestSchema>;
export type StartTestRideRequest = z.infer<typeof startTestRideRequestSchema>;
export type StopTestRideTrackingRequest = z.infer<typeof stopTestRideTrackingRequestSchema>;
export type TestRideDetail = z.infer<typeof testRideDetailSchema>;
export type TestRideListQuery = z.infer<typeof testRideListQuerySchema>;
export type TestRideStatus = z.infer<typeof testRideStatusSchema>;
export type TestRideSummary = z.infer<typeof testRideSummarySchema>;
