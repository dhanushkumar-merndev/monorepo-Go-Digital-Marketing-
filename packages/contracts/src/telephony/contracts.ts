import { z } from 'zod';
import { pageMetadataSchema } from '../pagination.js';

const idSchema = z.uuid();
const nonBlank = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();

export const TELEPHONY_CALL_STATUSES = [
  'REQUESTED',
  'RINGING',
  'ANSWERED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'UNKNOWN',
] as const;
export const TELEPHONY_CALL_OUTCOMES = [
  'INTERESTED',
  'CALLBACK',
  'TEST_RIDE_REQUESTED',
  'SHOWROOM_VISIT',
  'NO_ANSWER',
  'BUSY',
  'WRONG_NUMBER',
  'NOT_INTERESTED',
  'ALREADY_PURCHASED',
  'OTHER',
] as const;
export const TELEPHONY_CONNECTION_STATUSES = [
  'ACTIVE',
  'DISABLED',
  'PENDING_APPROVAL',
  'DEGRADED',
] as const;
export const TELEPHONY_RECORDING_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/wave',
] as const;

export const telephonyCallStatusSchema = z.enum(TELEPHONY_CALL_STATUSES);
export const telephonyCallOutcomeSchema = z.enum(TELEPHONY_CALL_OUTCOMES);
export const telephonyConnectionStatusSchema = z.enum(TELEPHONY_CONNECTION_STATUSES);
export const telephonyRecordingContentTypeSchema = z.enum(TELEPHONY_RECORDING_CONTENT_TYPES);

export const startCallRequestSchema = z.object({
  mode: z.enum(['PROVIDER', 'TEL_FALLBACK']).default('PROVIDER'),
});

export const recordCallOutcomeRequestSchema = z
  .object({
    callback_due_at: z.iso.datetime({ offset: true }).nullable().optional(),
    note: optionalText(2_000),
    outcome: telephonyCallOutcomeSchema,
  })
  .superRefine((value, context) => {
    if (value.outcome === 'CALLBACK' && !value.callback_due_at)
      context.addIssue({
        code: 'custom',
        path: ['callback_due_at'],
        message: 'Callback outcome requires a due time.',
      });
    if (value.outcome !== 'CALLBACK' && value.callback_due_at)
      context.addIssue({
        code: 'custom',
        path: ['callback_due_at'],
        message: 'Only CALLBACK outcomes may create a callback.',
      });
  });

export const approveCallOutcomeExceptionRequestSchema = z.object({
  reason: nonBlank(1_000),
});

export const configureTelephonyConnectionRequestSchema = z.object({
  active: z.boolean(),
  display_name: nonBlank(160).default('Development telephony'),
});

export const callListQuerySchema = z.object({
  lead_id: idSchema.optional(),
  missing_outcome: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
});

export const beginManualRecordingUploadRequestSchema = z
  .object({
    call_date_at: z.iso.datetime({ offset: true }),
    call_direction: z.enum(['INBOUND', 'OUTBOUND']),
    call_id: idSchema.optional(),
    checksum_sha256: z.string().base64().max(128).optional(),
    consent_record_id: idSchema,
    content_length: z.number().int().min(1),
    content_type: telephonyRecordingContentTypeSchema,
    duration_seconds: z.number().int().min(0).nullable().optional(),
    lead_id: idSchema.optional(),
    notes: optionalText(2_000),
    original_filename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine((value) => !/[\\/\r\n]/u.test(value), 'Filename must not contain a path.'),
    outcome: telephonyCallOutcomeSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (!value.call_id && !value.lead_id)
      context.addIssue({
        code: 'custom',
        path: ['lead_id'],
        message: 'Select an existing call or an authorized Lead.',
      });
  });

export const completeManualRecordingUploadRequestSchema = z.object({
  expected_content_length: z.number().int().min(1),
  expected_content_type: telephonyRecordingContentTypeSchema,
});

export const recordingTargetQuerySchema = z.object({
  search: z.string().trim().min(2).max(160),
});

export const telephonyCallSummarySchema = z.object({
  id: idSchema,
  lead_id: idSchema,
  contact_id: idSchema,
  origin: z.enum(['PROVIDER', 'TEL_FALLBACK', 'MANUAL_UPLOAD']),
  direction: z.enum(['INBOUND', 'OUTBOUND']),
  status: telephonyCallStatusSchema,
  outcome_requirement: z.enum(['NOT_REQUIRED', 'REQUIRED', 'RECORDED', 'EXCEPTION']),
  provider: z.string(),
  provider_call_id: z.string().nullable(),
  duration_seconds: z.number().int().nullable(),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  ended_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export const telephonyCallListResponseSchema = z.object({
  calls: z.array(telephonyCallSummarySchema),
  pagination: pageMetadataSchema,
});
export const telephonyCallDetailResponseSchema = z.object({
  call: telephonyCallSummarySchema,
  events: z.array(
    z.object({
      event_type: z.string(),
      id: idSchema,
      occurred_at: z.iso.datetime({ offset: true }),
      status: telephonyCallStatusSchema.nullable(),
    }),
  ),
  outcome: z
    .object({
      callback_follow_up_id: idSchema.nullable(),
      created_at: z.iso.datetime({ offset: true }),
      note: z.string().nullable(),
      outcome: telephonyCallOutcomeSchema,
    })
    .nullable(),
  recordings: z.array(
    z.object({
      availability: z.enum(['PENDING', 'AVAILABLE', 'UNAVAILABLE', 'EXPIRED']),
      id: idSchema,
      recorded_at: z.iso.datetime({ offset: true }).nullable(),
      source: z.enum(['PROVIDER', 'MANUAL_UPLOAD']),
      retention_expires_at: z.iso.datetime({ offset: true }).nullable(),
    }),
  ),
});

export type StartCallRequest = z.infer<typeof startCallRequestSchema>;
export type RecordCallOutcomeRequest = z.infer<typeof recordCallOutcomeRequestSchema>;
export type ApproveCallOutcomeExceptionRequest = z.infer<
  typeof approveCallOutcomeExceptionRequestSchema
>;
export type ConfigureTelephonyConnectionRequest = z.infer<
  typeof configureTelephonyConnectionRequestSchema
>;
export type CallListQuery = z.infer<typeof callListQuerySchema>;
export type BeginManualRecordingUploadRequest = z.infer<
  typeof beginManualRecordingUploadRequestSchema
>;
export type CompleteManualRecordingUploadRequest = z.infer<
  typeof completeManualRecordingUploadRequestSchema
>;
export type RecordingTargetQuery = z.infer<typeof recordingTargetQuerySchema>;
