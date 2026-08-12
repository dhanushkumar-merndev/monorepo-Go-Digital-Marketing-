import { z } from 'zod';
import { pageMetadataSchema } from '../pagination.js';

const idSchema = z.uuid();
const nonBlank = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const LEAD_SOURCE_CODES = [
  'META',
  'WHATSAPP_AD',
  'GOOGLE_ADS',
  'WEBSITE',
  'WALK_IN',
  'OTHER',
] as const;
export const LEAD_STATUSES = [
  'NEW',
  'PENDING_REVIEW',
  'CONTACT_ATTEMPT',
  'ACCEPTED',
  'REJECTED',
  'CONTACTED',
  'INTERESTED',
  'FOLLOW_UP',
  'SHOWROOM_VISIT',
  'TEST_RIDE_REQUESTED',
  'TEST_RIDE_BOOKED',
  'TEST_RIDE_COMPLETED',
  'NEGOTIATION',
  'BOOKING_CONFIRMED',
  'LOST',
  'REOPENED',
] as const;
export const REJECTION_REASONS = [
  'INVALID_NUMBER',
  'DUPLICATE',
  'NOT_INTERESTED_FIRST_CONTACT',
  'OUTSIDE_SERVICE_AREA',
  'WRONG_ENQUIRY',
  'ALREADY_PURCHASED',
  'SPAM',
] as const;
export const LOST_REASONS = [
  'PRICE',
  'FINANCE_REJECTED',
  'MODEL_UNAVAILABLE',
  'COMPETITOR_PURCHASE',
  'POSTPONED',
  'NO_RESPONSE',
  'FAMILY_DECISION',
  'OTHER',
] as const;

export const leadSourceSchema = z.enum(LEAD_SOURCE_CODES);
export const leadStatusSchema = z.enum(LEAD_STATUSES);
export const rejectionReasonSchema = z.enum(REJECTION_REASONS);
export const lostReasonSchema = z.enum(LOST_REASONS);
export const leadEntryMethodSchema = z.enum(['MANUAL', 'PUBLIC_FORM', 'PROVIDER', 'IMPORT']);
export const assignmentMethodSchema = z.enum(['MANUAL', 'ROUND_ROBIN']);
export const followUpChannelSchema = z.enum([
  'CALL',
  'WHATSAPP',
  'EMAIL',
  'SMS',
  'SHOWROOM',
  'OTHER',
]);
export const taskPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const campaignAttributionSchema = z.object({
  campaign_id: optionalText(256),
  campaign_name: optionalText(256),
  ad_id: optionalText(256),
  ad_set_id: optionalText(256),
  form_id: optionalText(256),
  gclid: optionalText(256),
  utm_source: optionalText(256),
  utm_medium: optionalText(256),
  utm_campaign: optionalText(256),
  utm_term: optionalText(256),
  utm_content: optionalText(256),
  page_url: z.url().max(2048).nullable().optional(),
});

const createLeadRequestBaseSchema = z.object({
  name: nonBlank(160),
  phone: nonBlank(32),
  alternate_phone: optionalText(32),
  email: z.email().trim().toLowerCase().nullable().optional(),
  branch_id: idSchema,
  source: leadSourceSchema,
  source_name: optionalText(160),
  source_metadata: z
    .record(z.string().max(64), z.unknown())
    .refine((value) => JSON.stringify(value).length <= 10_000, 'Source metadata is too large')
    .optional(),
  vehicle_interest: nonBlank(240),
  language: optionalText(32),
  campaign: campaignAttributionSchema.optional(),
  consent: z.object({
    purpose: z.enum(['LEAD_RESPONSE', 'MARKETING']),
    granted: z.boolean(),
    notice_version: nonBlank(64),
    evidence: nonBlank(1000),
  }),
  assignment_queue_id: idSchema.nullable().optional(),
});

function requireOtherSource(
  value: { source: LeadSource; source_name?: string | null | undefined },
  context: z.RefinementCtx,
): void {
  if (value.source === 'OTHER' && !value.source_name)
    context.addIssue({
      code: 'custom',
      path: ['source_name'],
      message: 'OTHER source requires source_name',
    });
}

export const createLeadRequestSchema = createLeadRequestBaseSchema.superRefine(requireOtherSource);

export const publicLeadFormRequestSchema = createLeadRequestBaseSchema
  .omit({ branch_id: true, assignment_queue_id: true })
  .extend({
    branch_code: nonBlank(64).nullable().optional(),
    bot_token: z.string().trim().max(4096).nullable().optional(),
  })
  .superRefine((value, context) => {
    requireOtherSource(value, context);
    if (!value.consent.granted)
      context.addIssue({
        code: 'custom',
        path: ['consent', 'granted'],
        message: 'Public lead forms require affirmative lead-response consent',
      });
    if (!value.campaign?.page_url)
      context.addIssue({
        code: 'custom',
        path: ['campaign', 'page_url'],
        message: 'The originating page URL is required',
      });
  });

export const leadTransitionRequestSchema = z
  .object({
    expected_version: z.number().int().positive(),
    to_status: leadStatusSchema,
    note: nonBlank(2000),
    rejection_reason: rejectionReasonSchema.nullable().optional(),
    lost_reason: lostReasonSchema.nullable().optional(),
    reopen_reason: nonBlank(1000).nullable().optional(),
    next_action_at: z.iso.datetime({ offset: true }).nullable().optional(),
    follow_up_channel: followUpChannelSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.to_status === 'REJECTED' && !value.rejection_reason)
      context.addIssue({ code: 'custom', path: ['rejection_reason'], message: 'Required' });
    if (value.to_status === 'LOST' && !value.lost_reason)
      context.addIssue({ code: 'custom', path: ['lost_reason'], message: 'Required' });
    if (value.to_status === 'REOPENED' && (!value.reopen_reason || !value.next_action_at))
      context.addIssue({
        code: 'custom',
        path: ['reopen_reason'],
        message: 'Reopening requires a reason and next action',
      });
  });

export const assignLeadRequestSchema = z.object({
  expected_version: z.number().int().positive(),
  membership_id: idSchema,
  reason: nonBlank(1000),
  transfer_relationship_owner: z.boolean().default(false),
});

export const createFollowUpRequestSchema = z.object({
  due_at: z.iso.datetime({ offset: true }),
  channel: followUpChannelSchema,
  priority: taskPrioritySchema.default('NORMAL'),
  purpose: nonBlank(500),
  note: optionalText(2000),
  owner_membership_id: idSchema.nullable().optional(),
});
export const completeFollowUpRequestSchema = z.object({
  outcome: nonBlank(500),
  note: optionalText(2000),
});
export const createLeadNoteRequestSchema = z.object({ note: nonBlank(4000) });
export const createLeadTaskRequestSchema = z.object({
  title: nonBlank(240),
  due_at: z.iso.datetime({ offset: true }),
  priority: taskPrioritySchema.default('NORMAL'),
  owner_membership_id: idSchema.nullable().optional(),
});
export const completeLeadTaskRequestSchema = z.object({ note: nonBlank(2000) });
export const resolveDuplicateRequestSchema = z.object({
  resolution: z.enum(['LINK_CANONICAL', 'KEEP_SEPARATE', 'DISMISS']),
  canonical_contact_id: idSchema.nullable().optional(),
  reason: nonBlank(1000),
});
export const updateLeadSlaSettingsRequestSchema = z
  .object({
    expected_version: z.number().int().positive(),
    first_action_sla_minutes: z.number().int().min(1).max(1440),
    warning_before_minutes: z.number().int().min(0).max(1439),
    outside_hours_policy: z.literal('NEXT_BUSINESS_HOUR'),
  })
  .refine((value) => value.warning_before_minutes < value.first_action_sla_minutes, {
    path: ['warning_before_minutes'],
    message: 'Warning must occur before the SLA deadline',
  });

export const leadListQuerySchema = z.object({
  status: leadStatusSchema.optional(),
  history_status: z.enum(['REJECTED', 'LOST']).optional(),
  source: leadSourceSchema.optional(),
  campaign: z.string().trim().max(256).optional(),
  branch_id: idSchema.optional(),
  queue_id: idSchema.optional(),
  sla: z.enum(['ALL', 'WARNING', 'BREACHED']).default('ALL'),
  search: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
});

export const leadSummarySchema = z.object({
  id: idSchema,
  contact_id: idSchema,
  contact_name: z.string(),
  phone_e164: z.string(),
  branch_id: idSchema,
  source: leadSourceSchema,
  source_name: z.string().nullable(),
  campaign_name: z.string().nullable(),
  vehicle_interest: z.string(),
  status: leadStatusSchema,
  relationship_owner_id: idSchema.nullable(),
  current_process_owner_id: idSchema.nullable(),
  conversation_owner_id: idSchema.nullable(),
  next_action_at: z.iso.datetime({ offset: true }).nullable(),
  sla_due_at: z.iso.datetime({ offset: true }),
  sla_state: z.enum(['OPEN', 'MET', 'WARNING', 'BREACHED']),
  version: z.number().int().positive(),
  captured_at: z.iso.datetime({ offset: true }),
});
export const leadListResponseSchema = z.object({
  leads: z.array(leadSummarySchema),
  pagination: pageMetadataSchema,
});
export const leadDetailResponseSchema = z.object({
  lead: leadSummarySchema.extend({
    email: z.string().nullable(),
    alternate_phone_e164: z.string().nullable(),
    entry_method: leadEntryMethodSchema,
    campaign: campaignAttributionSchema.nullable(),
    rejection_reason: rejectionReasonSchema.nullable(),
    lost_reason: lostReasonSchema.nullable(),
  }),
  timeline: z.array(
    z.object({
      id: idSchema,
      type: z.string(),
      title: z.string(),
      detail: z.string().nullable(),
      actor_id: z.string().nullable(),
      occurred_at: z.iso.datetime({ offset: true }),
    }),
  ),
  follow_ups: z.array(z.record(z.string(), z.unknown())),
  tasks: z.array(z.record(z.string(), z.unknown())),
});
export const createLeadResponseSchema = z.object({
  lead: leadSummarySchema,
  duplicate_candidate: z.boolean(),
  replayed: z.boolean(),
});

export type LeadSource = z.infer<typeof leadSourceSchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;
export type RejectionReason = z.infer<typeof rejectionReasonSchema>;
export type LostReason = z.infer<typeof lostReasonSchema>;
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;
export type PublicLeadFormRequest = z.infer<typeof publicLeadFormRequestSchema>;
export type LeadTransitionRequest = z.infer<typeof leadTransitionRequestSchema>;
export type AssignLeadRequest = z.infer<typeof assignLeadRequestSchema>;
export type CreateFollowUpRequest = z.infer<typeof createFollowUpRequestSchema>;
export type CompleteFollowUpRequest = z.infer<typeof completeFollowUpRequestSchema>;
export type CreateLeadNoteRequest = z.infer<typeof createLeadNoteRequestSchema>;
export type CreateLeadTaskRequest = z.infer<typeof createLeadTaskRequestSchema>;
export type CompleteLeadTaskRequest = z.infer<typeof completeLeadTaskRequestSchema>;
export type ResolveDuplicateRequest = z.infer<typeof resolveDuplicateRequestSchema>;
export type UpdateLeadSlaSettingsRequest = z.infer<typeof updateLeadSlaSettingsRequestSchema>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
