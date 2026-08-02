import { z } from 'zod';

import { booleanFromEnvironment, emptyStringToUndefined } from './shared.js';

const databaseUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'postgres:' || protocol === 'postgresql:';
}, 'DATABASE_URL must use postgres:// or postgresql://');

const redisUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'redis:' || protocol === 'rediss:';
}, 'REDIS_URL must use redis:// or rediss://');

export const workerModeSchema = z.enum(['disabled', 'embedded', 'standalone']);

const portSchema = z.coerce.number().int().min(1).max(65_535);
const bucketSchema = z.string().trim().min(3).max(63);
const optionalCredentialSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);
const optionalUrlSchema = z.preprocess(emptyStringToUndefined, z.url().optional());
const DEFAULT_TIGRIS_ENDPOINT = 'https://t3.storage.dev';

const rawApiEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    API_HOST: z.string().trim().min(1).default('0.0.0.0'),
    API_PORT: portSchema.optional(),
    PORT: portSchema.optional(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    DATABASE_URL: databaseUrlSchema,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    REDIS_URL: redisUrlSchema,
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    WORKER_MODE: workerModeSchema.default('disabled'),
    S3_ENDPOINT: optionalUrlSchema,
    S3_REGION: z.string().trim().min(1).default('auto'),
    S3_BUCKET: z.preprocess(emptyStringToUndefined, bucketSchema.optional()),
    S3_ACCESS_KEY_ID: optionalCredentialSchema,
    S3_SECRET_ACCESS_KEY: optionalCredentialSchema,
    S3_FORCE_PATH_STYLE: booleanFromEnvironment.default(false),
    TIGRIS_ENDPOINT: optionalUrlSchema,
    TIGRIS_BUCKET: z.preprocess(emptyStringToUndefined, bucketSchema.optional()),
    TIGRIS_ACCESS_KEY_ID: optionalCredentialSchema,
    TIGRIS_SECRET_ACCESS_KEY: optionalCredentialSchema,
    SENTRY_DSN: z.preprocess(emptyStringToUndefined, z.url().optional()),
  })
  .superRefine((environment, context) => {
    if (
      environment.API_PORT !== undefined &&
      environment.PORT !== undefined &&
      environment.API_PORT !== environment.PORT
    ) {
      context.addIssue({
        code: 'custom',
        path: ['API_PORT'],
        message: 'API_PORT and PORT must match when both are supplied',
      });
    }

    const hasAccessKey = environment.S3_ACCESS_KEY_ID !== undefined;
    const hasSecretKey = environment.S3_SECRET_ACCESS_KEY !== undefined;

    if (hasAccessKey !== hasSecretKey) {
      context.addIssue({
        code: 'custom',
        path: hasAccessKey ? ['S3_SECRET_ACCESS_KEY'] : ['S3_ACCESS_KEY_ID'],
        message: 'S3 access key ID and secret access key must be supplied together',
      });
    }

    const hasGenericStorage = [
      environment.S3_ENDPOINT,
      environment.S3_BUCKET,
      environment.S3_ACCESS_KEY_ID,
      environment.S3_SECRET_ACCESS_KEY,
    ].some((value) => value !== undefined);
    const hasTigrisStorage = [
      environment.TIGRIS_ENDPOINT,
      environment.TIGRIS_BUCKET,
      environment.TIGRIS_ACCESS_KEY_ID,
      environment.TIGRIS_SECRET_ACCESS_KEY,
    ].some((value) => value !== undefined);

    if (hasGenericStorage && hasTigrisStorage) {
      context.addIssue({
        code: 'custom',
        path: ['TIGRIS_BUCKET'],
        message: 'Use either TIGRIS_* or S3_* object-storage settings, not both',
      });
      return;
    }

    if (hasTigrisStorage) {
      for (const [key, value] of [
        ['TIGRIS_BUCKET', environment.TIGRIS_BUCKET],
        ['TIGRIS_ACCESS_KEY_ID', environment.TIGRIS_ACCESS_KEY_ID],
        ['TIGRIS_SECRET_ACCESS_KEY', environment.TIGRIS_SECRET_ACCESS_KEY],
      ] as const) {
        if (value === undefined) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when Tigris object storage is selected`,
          });
        }
      }
    } else if (environment.S3_BUCKET === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['S3_BUCKET'],
        message: 'S3_BUCKET is required when generic S3 object storage is selected',
      });
    }
  });

export const apiEnvironmentSchema = rawApiEnvironmentSchema.transform((environment) => {
  const usesTigris = [
    environment.TIGRIS_ENDPOINT,
    environment.TIGRIS_BUCKET,
    environment.TIGRIS_ACCESS_KEY_ID,
    environment.TIGRIS_SECRET_ACCESS_KEY,
  ].some((value) => value !== undefined);
  const s3Bucket = usesTigris ? environment.TIGRIS_BUCKET : environment.S3_BUCKET;

  if (!s3Bucket) {
    throw new Error('Object-storage bucket validation did not resolve a provider bucket.');
  }

  return {
    nodeEnv: environment.NODE_ENV,
    host: environment.API_HOST,
    port: environment.API_PORT ?? environment.PORT ?? 4000,
    logLevel: environment.LOG_LEVEL,
    corsOrigins: environment.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    databaseUrl: environment.DATABASE_URL,
    databasePoolMax: environment.DATABASE_POOL_MAX,
    redisUrl: environment.REDIS_URL,
    redisConnectTimeoutMs: environment.REDIS_CONNECT_TIMEOUT_MS,
    workerMode: environment.WORKER_MODE,
    s3Endpoint: usesTigris
      ? (environment.TIGRIS_ENDPOINT ?? DEFAULT_TIGRIS_ENDPOINT)
      : environment.S3_ENDPOINT,
    s3Region: environment.S3_REGION,
    s3Bucket,
    s3AccessKeyId: usesTigris ? environment.TIGRIS_ACCESS_KEY_ID : environment.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: usesTigris
      ? environment.TIGRIS_SECRET_ACCESS_KEY
      : environment.S3_SECRET_ACCESS_KEY,
    s3ForcePathStyle: usesTigris ? false : environment.S3_FORCE_PATH_STYLE,
    sentryDsn: environment.SENTRY_DSN,
  };
});

export type ApiEnvironment = z.output<typeof apiEnvironmentSchema>;
export type WorkerMode = z.infer<typeof workerModeSchema>;

export const parseApiEnvironment = (environment: NodeJS.ProcessEnv = process.env): ApiEnvironment =>
  apiEnvironmentSchema.parse(environment);
