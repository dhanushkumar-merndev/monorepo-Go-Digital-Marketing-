import { z } from 'zod';

const rawTelephonyEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  TELEPHONY_DEVELOPMENT_WEBHOOK_SECRET: z
    .string()
    .trim()
    .min(32)
    .default('local-development-telephony-webhook-secret-change-me'),
  TELEPHONY_RECORDING_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
  TELEPHONY_MANUAL_RECORDING_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1_048_576)
    .max(104_857_600)
    .default(26_214_400),
  TELEPHONY_WEBHOOK_RAW_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(168),
});

export const telephonyEnvironmentSchema = rawTelephonyEnvironmentSchema.transform(
  (environment) => ({
    developmentAdapterEnabled:
      environment.NODE_ENV === 'development' || environment.NODE_ENV === 'test',
    developmentWebhookSecret: environment.TELEPHONY_DEVELOPMENT_WEBHOOK_SECRET,
    manualRecordingMaxBytes: environment.TELEPHONY_MANUAL_RECORDING_MAX_BYTES,
    recordingUrlTtlSeconds: environment.TELEPHONY_RECORDING_URL_TTL_SECONDS,
    webhookRawRetentionHours: environment.TELEPHONY_WEBHOOK_RAW_RETENTION_HOURS,
  }),
);

export type TelephonyEnvironment = z.output<typeof telephonyEnvironmentSchema>;

export const parseTelephonyEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): TelephonyEnvironment => telephonyEnvironmentSchema.parse(environment);
