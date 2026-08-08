import { z } from 'zod';

const rawMessagingEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  MESSAGING_CREDENTIAL_ENCRYPTION_KEY: z.string().trim().optional(),
  MESSAGING_CREDENTIAL_KEY_ID: z.string().trim().min(1).max(64).default('messaging-v1'),
  MESSAGING_DEVELOPMENT_WEBHOOK_SECRET: z
    .string()
    .trim()
    .min(32)
    .default('local-development-messaging-webhook-secret-change-me'),
  MESSAGING_MEDIA_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1_048_576)
    .max(104_857_600)
    .default(26_214_400),
  MESSAGING_MEDIA_RETENTION_DAYS: z.coerce.number().int().min(1).max(3650).default(365),
  MESSAGING_MEDIA_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
  MESSAGING_OUTBOUND_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  MESSAGING_SERVICE_WINDOW_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  MESSAGING_WEBHOOK_RAW_RETENTION_HOURS: z.coerce.number().int().min(1).max(720).default(168),
});

export const messagingEnvironmentSchema = rawMessagingEnvironmentSchema.transform(
  (environment, context) => {
    let credentialEncryptionKey: Buffer | undefined;
    if (environment.MESSAGING_CREDENTIAL_ENCRYPTION_KEY) {
      credentialEncryptionKey = Buffer.from(
        environment.MESSAGING_CREDENTIAL_ENCRYPTION_KEY,
        'base64',
      );
      if (credentialEncryptionKey.length !== 32) {
        context.addIssue({
          code: 'custom',
          message: 'MESSAGING_CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes.',
          path: ['MESSAGING_CREDENTIAL_ENCRYPTION_KEY'],
        });
        return z.NEVER;
      }
    }
    return {
      credentialEncryptionKey,
      credentialKeyId: environment.MESSAGING_CREDENTIAL_KEY_ID,
      developmentAdapterEnabled:
        environment.NODE_ENV === 'development' || environment.NODE_ENV === 'test',
      developmentWebhookSecret: environment.MESSAGING_DEVELOPMENT_WEBHOOK_SECRET,
      mediaMaxBytes: environment.MESSAGING_MEDIA_MAX_BYTES,
      mediaRetentionDays: environment.MESSAGING_MEDIA_RETENTION_DAYS,
      mediaUrlTtlSeconds: environment.MESSAGING_MEDIA_URL_TTL_SECONDS,
      outboundMaxAttempts: environment.MESSAGING_OUTBOUND_MAX_ATTEMPTS,
      serviceWindowHours: environment.MESSAGING_SERVICE_WINDOW_HOURS,
      webhookRawRetentionHours: environment.MESSAGING_WEBHOOK_RAW_RETENTION_HOURS,
    };
  },
);

export type MessagingEnvironment = z.output<typeof messagingEnvironmentSchema>;

export const parseMessagingEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): MessagingEnvironment => messagingEnvironmentSchema.parse(environment);
