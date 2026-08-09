import { z } from 'zod';

const localPhonePepper = 'local-development-lead-phone-pepper-change-me';

const rawLeadEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    LEAD_PHONE_LOOKUP_PEPPER: z.string().min(16).default(localPhonePepper),
    LEAD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
  })
  .superRefine((environment, context) => {
    if (
      (environment.NODE_ENV === 'staging' || environment.NODE_ENV === 'production') &&
      (environment.LEAD_PHONE_LOOKUP_PEPPER === localPhonePepper ||
        /(?:change[-_ ]?me|example|placeholder)/iu.test(environment.LEAD_PHONE_LOOKUP_PEPPER))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['LEAD_PHONE_LOOKUP_PEPPER'],
        message: 'Hosted environments require a private LEAD_PHONE_LOOKUP_PEPPER',
      });
    }
  });

export const leadEnvironmentSchema = rawLeadEnvironmentSchema.transform((environment) => ({
  phoneLookupPepper: environment.LEAD_PHONE_LOOKUP_PEPPER,
  publicRateLimitWindowSeconds: environment.LEAD_PUBLIC_RATE_LIMIT_WINDOW_SECONDS,
}));

export type LeadEnvironment = z.output<typeof leadEnvironmentSchema>;

export const parseLeadEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): LeadEnvironment => leadEnvironmentSchema.parse(environment);
