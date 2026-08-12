import { z } from 'zod';

export const REMINDER_TYPES = [
  'SERVICE_DUE',
  'INSURANCE_EXPIRY',
  'PUC_EXPIRY',
  'WARRANTY_EXPIRY',
  'AMC_EXPIRY',
  'ROADSIDE_ASSISTANCE_EXPIRY',
  'RC_PENDING',
  'SERVICE_APPOINTMENT',
  'EXCHANGE_ELIGIBILITY',
  'UPGRADE_OPPORTUNITY',
] as const;
export const reminderTypeSchema = z.enum(REMINDER_TYPES);
export const reminderCommunicationCategorySchema = z.enum(['OPERATIONAL', 'MARKETING']);
export const reminderChannelSchema = z.enum(['WHATSAPP', 'EMAIL', 'SMS']);
export const reminderThresholdKindSchema = z.enum(['DATE', 'KILOMETRE']);
export const reminderBaseDateFieldSchema = z.enum([
  'DELIVERY_DATE',
  'PURCHASE_DATE',
  'INSURANCE_EXPIRY',
  'PUC_EXPIRY',
  'WARRANTY_EXPIRY',
  'AMC_EXPIRY',
  'RSA_EXPIRY',
]);
export const reminderStatusSchema = z.enum([
  'SCHEDULED',
  'QUEUED',
  'SENT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'SUPPRESSED',
]);

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();

export const reminderRuleRequestSchema = z
  .object({
    active: z.boolean().default(true),
    base_date_field: reminderBaseDateFieldSchema.nullable().default(null),
    brand_name: nullableText(120).default(null),
    category: reminderCommunicationCategorySchema,
    channel: reminderChannelSchema,
    due_after_days: z.number().int().min(0).max(3650).nullable().default(null),
    due_kilometres: z.number().int().min(1).max(2_000_000).nullable().default(null),
    model_name: nullableText(120).default(null),
    model_year: z.number().int().min(1900).max(2200).nullable().default(null),
    notice_days: z.array(z.number().int().min(0).max(3650)).min(1).max(12),
    reminder_type: reminderTypeSchema,
    template_id: z.string().uuid(),
    threshold_kind: reminderThresholdKindSchema,
    variant_name: nullableText(160).default(null),
  })
  .superRefine((value, context) => {
    if (value.threshold_kind === 'DATE' && value.base_date_field === null)
      context.addIssue({ code: 'custom', message: 'Date rules require base_date_field.' });
    if (value.threshold_kind === 'DATE' && value.due_after_days === null)
      context.addIssue({ code: 'custom', message: 'Date rules require due_after_days.' });
    if (value.threshold_kind === 'KILOMETRE' && value.due_kilometres === null)
      context.addIssue({ code: 'custom', message: 'Kilometre rules require due_kilometres.' });
  });

export const reminderListQuerySchema = z.object({
  branch_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
  status: reminderStatusSchema.optional(),
  type: reminderTypeSchema.optional(),
});

export const rescheduleReminderRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
  scheduled_for: z.string().datetime({ offset: true }),
});

export const updateReminderPreferencesRequestSchema = z.object({
  expected_version: z.number().int().positive().nullable().default(null),
  marketing_enabled: z.boolean(),
  operational_enabled: z.boolean(),
  preferred_channel: reminderChannelSchema,
  reason: z.string().trim().min(3).max(1000),
});

export const recordReminderConsentRequestSchema = z.object({
  channel: reminderChannelSchema,
  evidence: z.string().trim().min(3).max(2000),
  notice_version: z.string().trim().min(1).max(64),
  source: z.string().trim().min(1).max(64),
  status: z.enum(['GRANTED', 'DENIED', 'WITHDRAWN']),
});

export const updateVehicleReminderDetailsRequestSchema = z.object({
  current_odometer_km: z.number().int().min(0).max(5_000_000).nullable(),
  expected_vehicle_version: z.number().int().positive(),
  model_year: z.number().int().min(1900).max(2200).nullable(),
  puc_expires_on: z.string().date().nullable(),
  reason: z.string().trim().min(3).max(1000),
  service_due_kilometres: z.number().int().min(1).max(5_000_000).nullable(),
  service_due_on: z.string().date().nullable(),
  service_plan_version: z.string().trim().min(1).max(64).nullable(),
});

export const customerActivityRequestSchema = z.object({
  activity_type: z.enum(['FEEDBACK', 'COMPLAINT', 'ESCALATION']),
  customer_vehicle_id: z.string().uuid().nullable().default(null),
  details: z.string().trim().min(3).max(4000),
  occurred_at: z.string().datetime({ offset: true }),
  subject: z.string().trim().min(1).max(240),
});

export type CustomerActivityRequest = z.infer<typeof customerActivityRequestSchema>;
export type ReminderListQuery = z.infer<typeof reminderListQuerySchema>;
export type RecordReminderConsentRequest = z.infer<typeof recordReminderConsentRequestSchema>;
export type ReminderRuleRequest = z.infer<typeof reminderRuleRequestSchema>;
export type ReminderStatus = z.infer<typeof reminderStatusSchema>;
export type ReminderType = z.infer<typeof reminderTypeSchema>;
export type RescheduleReminderRequest = z.infer<typeof rescheduleReminderRequestSchema>;
export type UpdateReminderPreferencesRequest = z.infer<
  typeof updateReminderPreferencesRequestSchema
>;
export type UpdateVehicleReminderDetailsRequest = z.infer<
  typeof updateVehicleReminderDetailsRequestSchema
>;
