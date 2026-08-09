import { z } from 'zod';

export const integrationProviderSchema = z.enum([
  'META_LEADS',
  'INSTAGRAM',
  'FACEBOOK_MESSENGER',
  'GOOGLE_ADS',
  'GOOGLE_BUSINESS',
  'GOOGLE_MAPS',
  'EMAIL',
  'SMS',
  'PUSH',
  'SOCIAL_PUBLISHING',
  'AI_IMAGE',
  'AI_TRANSCRIPTION',
]);

const integrationSettingValueSchema = z.union([
  z.string().trim().min(1).max(512),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().trim().min(1).max(160)).max(50),
]);

const providerSettingKeys = {
  AI_IMAGE: ['model', 'region'],
  AI_TRANSCRIPTION: ['language', 'model', 'region'],
  EMAIL: ['from_address', 'reply_to_address'],
  FACEBOOK_MESSENGER: ['business_account_id', 'page_id'],
  GOOGLE_ADS: ['customer_id', 'lead_form_id'],
  GOOGLE_BUSINESS: ['account_id', 'location_id'],
  GOOGLE_MAPS: ['region', 'route_profile'],
  INSTAGRAM: ['business_account_id', 'instagram_account_id'],
  META_LEADS: ['business_account_id', 'form_id', 'page_id'],
  PUSH: ['project_id', 'topic_prefix'],
  SMS: ['entity_id', 'sender_id', 'template_namespace'],
  SOCIAL_PUBLISHING: ['business_account_id', 'instagram_account_id', 'page_id'],
} as const satisfies Record<z.infer<typeof integrationProviderSchema>, readonly string[]>;

/**
 * This endpoint accepts public provider routing metadata only. OAuth codes, API
 * keys, tokens and webhook secrets must be handled by a dedicated encrypted
 * credential flow and can never be smuggled into the generic settings JSON.
 */
export const integrationConnectionRequestSchema = z
  .object({
    display_name: z.string().trim().min(2).max(160),
    provider: integrationProviderSchema,
    settings: z.record(z.string(), integrationSettingValueSchema).default({}),
  })
  .strict()
  .superRefine((input, context) => {
    const allowed = new Set<string>(providerSettingKeys[input.provider]);
    const keys = Object.keys(input.settings);
    if (keys.length > 20) {
      context.addIssue({
        code: 'custom',
        message: 'At most 20 public provider settings are allowed.',
        path: ['settings'],
      });
    }
    for (const key of keys) {
      if (!allowed.has(key)) {
        context.addIssue({
          code: 'custom',
          message: `${key} is not an allowed public setting for ${input.provider}.`,
          path: ['settings', key],
        });
      }
    }
  });
export const onboardingItemRequestSchema = z.object({
  complete: z.boolean(),
  evidence: z.string().trim().min(3).max(2000),
  item_code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{2,80}$/),
});
export const creativeRequestSchema = z.object({
  brief: z.string().trim().min(10).max(4000),
  brand_profile: z.string().trim().min(2).max(240),
  brand_template: z.string().trim().min(2).max(240),
});
export const reviewCreativeRequestSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
});
export const transcriptSuggestionRequestSchema = z.object({
  call_id: z.string().uuid(),
  recording_id: z.string().uuid(),
  transcript: z.string().trim().min(1).max(100_000),
  summary: z.string().trim().min(1).max(10_000),
  suggestions: z
    .array(
      z.object({
        field: z.string().trim().min(1).max(100),
        value: z.string().trim().min(1).max(1000),
      }),
    )
    .max(50),
});
export const reviewTranscriptSuggestionRequestSchema = z.object({
  accepted: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
});
export type CreativeRequest = z.infer<typeof creativeRequestSchema>;
export type IntegrationConnectionRequest = z.infer<typeof integrationConnectionRequestSchema>;
export type OnboardingItemRequest = z.infer<typeof onboardingItemRequestSchema>;
export type ReviewCreativeRequest = z.infer<typeof reviewCreativeRequestSchema>;
export type ReviewTranscriptSuggestionRequest = z.infer<
  typeof reviewTranscriptSuggestionRequestSchema
>;
export type TranscriptSuggestionRequest = z.infer<typeof transcriptSuggestionRequestSchema>;
