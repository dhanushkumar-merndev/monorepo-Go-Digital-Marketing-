import { z } from 'zod';
import { pageMetadataSchema } from '../pagination.js';

const idSchema = z.uuid();
const nonBlank = (max: number) => z.string().trim().min(1).max(max);

export const messagingChannelSchema = z.enum(['WHATSAPP', 'EMAIL', 'SMS']);
export const messagingConnectionStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'ACTIVE',
  'DEGRADED',
  'DISABLED',
]);
export const conversationStatusSchema = z.enum(['OPEN', 'PENDING', 'CLOSED']);
export const messageContentTypeSchema = z.enum(['TEXT', 'TEMPLATE', 'MEDIA', 'NOTE']);
export const messageDirectionSchema = z.enum(['INBOUND', 'OUTBOUND', 'INTERNAL']);
export const messageDeliveryStatusSchema = z.enum([
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'READ',
  'RECEIVED',
  'FAILED',
]);
export const messageTemplateCategorySchema = z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']);
export const messageTemplateStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'PAUSED',
  'DISABLED',
]);

export const conversationListQuerySchema = z.object({
  assigned_to_me: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).default(1),
  search: z.string().trim().max(160).optional(),
  status: conversationStatusSchema.optional(),
});

export const conversationMessagePageQuerySchema = z.object({
  before: z.string().trim().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const sendMessageRequestSchema = z.discriminatedUnion('content_type', [
  z.object({ content_type: z.literal('TEXT'), text: nonBlank(4096) }),
  z.object({
    content_type: z.literal('TEMPLATE'),
    template_id: idSchema,
    variables: z
      .record(z.string().regex(/^\d+$/u), z.string().trim().min(1).max(1024))
      .refine((variables) => Object.keys(variables).length <= 100, {
        message: 'A template may contain at most 100 variables.',
      })
      .default({}),
  }),
]);

/** Returns the canonical numbered WhatsApp body placeholders in provider order. */
export function messageTemplateVariableKeys(bodyText: string): string[] {
  const keys = new Set<string>();
  for (const match of bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/gu)) {
    const key = match[1];
    if (key) keys.add(key);
  }
  return [...keys].sort((left, right) => Number(left) - Number(right));
}

export const createInternalNoteRequestSchema = z.object({ note: nonBlank(5000) });

export const assignConversationRequestSchema = z
  .object({
    expected_version: z.number().int().min(1),
    owner_membership_id: idSchema.nullable(),
    reason: nonBlank(500),
    team_id: idSchema.nullable(),
  })
  .refine((value) => value.owner_membership_id !== null || value.team_id !== null, {
    message: 'Select an owner or queue team.',
    path: ['owner_membership_id'],
  });

export const configureDevelopmentMessagingConnectionRequestSchema = z.object({
  branch_id: idSchema,
  business_phone_e164: nonBlank(32),
  default_assignment_queue_id: idSchema.nullable().default(null),
  display_name: nonBlank(160),
  enabled: z.boolean(),
});

export const configureWhatsAppCloudConnectionRequestSchema = z.object({
  access_token: nonBlank(4096),
  app_secret: nonBlank(4096),
  branch_id: idSchema,
  business_phone_e164: nonBlank(32),
  default_assignment_queue_id: idSchema.nullable().default(null),
  display_name: nonBlank(160),
  graph_api_version: nonBlank(32),
  phone_number_id: nonBlank(128),
  verify_token: nonBlank(512),
  waba_id: nonBlank(128),
});

export const beginMessageMediaUploadRequestSchema = z.object({
  caption: z.string().trim().max(4096).nullable().default(null),
  conversation_id: idSchema,
  filename: nonBlank(180),
  mime_type: z.enum([
    'image/jpeg',
    'image/png',
    'application/pdf',
    'audio/mpeg',
    'audio/mp4',
    'video/mp4',
  ]),
  size_bytes: z.number().int().positive(),
});

export const completeMessageMediaUploadRequestSchema = z.object({
  checksum_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/iu)
    .nullable()
    .default(null),
});

export const templateListQuerySchema = z.object({
  category: messageTemplateCategorySchema.optional(),
  status: messageTemplateStatusSchema.optional(),
});

export const messageSummarySchema = z.object({
  body_text: z.string().nullable(),
  content_type: messageContentTypeSchema,
  created_at: z.iso.datetime(),
  direction: messageDirectionSchema,
  id: idSchema,
  media: z.array(
    z.object({
      availability: z.enum(['PENDING', 'AVAILABLE', 'UNAVAILABLE', 'EXPIRED']),
      filename: z.string().nullable(),
      id: idSchema,
      mime_type: z.string(),
      size_bytes: z.number().int().nullable(),
    }),
  ),
  provider_occurred_at: z.iso.datetime().nullable(),
  status: messageDeliveryStatusSchema,
  template_name: z.string().nullable(),
});

export const conversationSummarySchema = z.object({
  channel: messagingChannelSchema,
  contact_id: idSchema,
  contact_name: z.string(),
  conversation_owner_id: idSchema.nullable(),
  id: idSchema,
  last_message_at: z.iso.datetime().nullable(),
  lead_id: idSchema,
  phone_e164: z.string(),
  status: conversationStatusSchema,
  team_id: idSchema.nullable(),
  unread_count: z.number().int().min(0),
  version: z.number().int().min(1),
});

export const conversationListResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
  pagination: pageMetadataSchema,
});

export const conversationDetailResponseSchema = z.object({
  conversation: conversationSummarySchema.extend({
    branch_id: idSchema,
    free_form_allowed: z.boolean(),
    free_form_window_expires_at: z.iso.datetime().nullable(),
    vehicle_interest: z.string(),
  }),
  messages: z.array(messageSummarySchema),
  message_page: z.object({ has_more: z.boolean(), next_cursor: z.string().nullable() }),
});

export const conversationMessagePageResponseSchema = z.object({
  messages: z.array(messageSummarySchema),
  page: z.object({ has_more: z.boolean(), next_cursor: z.string().nullable() }),
});

export const messageTemplateResponseSchema = z.object({
  body_text: z.string(),
  category: messageTemplateCategorySchema,
  id: idSchema,
  language: z.string(),
  name: z.string(),
  status: messageTemplateStatusSchema,
});

export const messagingConnectionResponseSchema = z.object({
  business_phone_e164: z.string().nullable(),
  channel: messagingChannelSchema,
  display_name: z.string(),
  id: idSchema,
  last_health_at: z.iso.datetime().nullable(),
  last_health_status: z.string().nullable(),
  last_webhook_at: z.iso.datetime().nullable(),
  messaging_limit: z.string().nullable(),
  phone_number_id: z.string().nullable(),
  provider: z.string(),
  quality_rating: z.string().nullable(),
  status: messagingConnectionStatusSchema,
  template_sync_status: z.string(),
  token_configured: z.boolean(),
  waba_id: z.string().nullable(),
  webhook_callback_path: z.string(),
  webhook_state: z.string(),
});

export type AssignConversationRequest = z.infer<typeof assignConversationRequestSchema>;
export type BeginMessageMediaUploadRequest = z.infer<typeof beginMessageMediaUploadRequestSchema>;
export type CompleteMessageMediaUploadRequest = z.infer<
  typeof completeMessageMediaUploadRequestSchema
>;
export type ConfigureDevelopmentMessagingConnectionRequest = z.infer<
  typeof configureDevelopmentMessagingConnectionRequestSchema
>;
export type ConfigureWhatsAppCloudConnectionRequest = z.infer<
  typeof configureWhatsAppCloudConnectionRequestSchema
>;
export type ConversationDetailResponse = z.infer<typeof conversationDetailResponseSchema>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type ConversationMessagePageQuery = z.infer<typeof conversationMessagePageQuerySchema>;
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;
export type CreateInternalNoteRequest = z.infer<typeof createInternalNoteRequestSchema>;
export type MessageTemplateResponse = z.infer<typeof messageTemplateResponseSchema>;
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;
