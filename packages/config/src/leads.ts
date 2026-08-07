import { z } from 'zod';

const rawLeadEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LEAD_PHONE_LOOKUP_PEPPER: z
    .string()
    .min(16)
    .default('local-development-lead-phone-pepper-change-me'),
  LEAD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
});

export const leadEnvironmentSchema = rawLeadEnvironmentSchema.transform((environment) => ({
  phoneLookupPepper: environment.LEAD_PHONE_LOOKUP_PEPPER,
  publicRateLimitWindowSeconds: environment.LEAD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS,
}));

export type LeadEnvironment = z.output<typeof leadEnvironmentSchema>;

export const parseLeadEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): LeadEnvironment => leadEnvironmentSchema.parse(environment);
