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
export const integrationConnectionRequestSchema = z.object({
  display_name: z.string().trim().min(2).max(160),
  provider: integrationProviderSchema,
  settings: z.record(z.string(), z.unknown()).default({}),
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
