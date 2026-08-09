import { z } from 'zod';

const rawMessagingEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  MESSAGING_CREDENTIAL_DECRYPTION_KEYS: z.string().trim().default('{}'),
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
    const hosted = environment.NODE_ENV === 'staging' || environment.NODE_ENV === 'production';
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

    if (hosted && !credentialEncryptionKey) {
      context.addIssue({
        code: 'custom',
        message: 'MESSAGING_CREDENTIAL_ENCRYPTION_KEY is required in hosted environments.',
        path: ['MESSAGING_CREDENTIAL_ENCRYPTION_KEY'],
      });
      return z.NEVER;
    }

    let rawDecryptionKeys: unknown;
    try {
      rawDecryptionKeys = JSON.parse(environment.MESSAGING_CREDENTIAL_DECRYPTION_KEYS);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'MESSAGING_CREDENTIAL_DECRYPTION_KEYS must be a JSON object.',
        path: ['MESSAGING_CREDENTIAL_DECRYPTION_KEYS'],
      });
      return z.NEVER;
    }

    const parsedDecryptionKeys = z
      .record(
        z
          .string()
          .trim()
          .min(1)
          .max(64)
          .regex(/^[A-Za-z0-9._-]+$/u),
        z.string().trim().min(1),
      )
      .safeParse(rawDecryptionKeys);
    if (!parsedDecryptionKeys.success) {
      context.addIssue({
        code: 'custom',
        message: 'MESSAGING_CREDENTIAL_DECRYPTION_KEYS must map key IDs to base64 keys.',
        path: ['MESSAGING_CREDENTIAL_DECRYPTION_KEYS'],
      });
      return z.NEVER;
    }
    if (Object.keys(parsedDecryptionKeys.data).length > 10) {
      context.addIssue({
        code: 'custom',
        message: 'MESSAGING_CREDENTIAL_DECRYPTION_KEYS supports at most 10 previous keys.',
        path: ['MESSAGING_CREDENTIAL_DECRYPTION_KEYS'],
      });
      return z.NEVER;
    }
    if (environment.MESSAGING_CREDENTIAL_KEY_ID in parsedDecryptionKeys.data) {
      context.addIssue({
        code: 'custom',
        message: 'The active messaging key ID cannot also be a previous key ID.',
        path: ['MESSAGING_CREDENTIAL_DECRYPTION_KEYS'],
      });
      return z.NEVER;
    }

    const credentialDecryptionKeys: Record<string, Buffer> = {};
    for (const [keyId, encodedKey] of Object.entries(parsedDecryptionKeys.data)) {
      const key = Buffer.from(encodedKey, 'base64');
      if (key.length !== 32) {
        context.addIssue({
          code: 'custom',
          message: `Previous messaging key ${keyId} must decode to exactly 32 bytes.`,
          path: ['MESSAGING_CREDENTIAL_DECRYPTION_KEYS'],
        });
        return z.NEVER;
      }
      credentialDecryptionKeys[keyId] = key;
    }

    return {
      credentialDecryptionKeys: Object.freeze(credentialDecryptionKeys),
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
