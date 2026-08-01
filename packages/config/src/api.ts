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

const rawApiEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    API_HOST: z.string().trim().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    DATABASE_URL: databaseUrlSchema,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    REDIS_URL: redisUrlSchema,
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    WORKER_MODE: workerModeSchema.default('disabled'),
    S3_ENDPOINT: z.preprocess(emptyStringToUndefined, z.url().optional()),
    S3_REGION: z.string().trim().min(1).default('auto'),
    S3_BUCKET: z.string().trim().min(3).max(63),
    S3_ACCESS_KEY_ID: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    S3_SECRET_ACCESS_KEY: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
    S3_FORCE_PATH_STYLE: booleanFromEnvironment.default(false),
    SENTRY_DSN: z.preprocess(emptyStringToUndefined, z.url().optional()),
  })
  .superRefine((environment, context) => {
    const hasAccessKey = environment.S3_ACCESS_KEY_ID !== undefined;
    const hasSecretKey = environment.S3_SECRET_ACCESS_KEY !== undefined;

    if (hasAccessKey !== hasSecretKey) {
      context.addIssue({
        code: 'custom',
        path: hasAccessKey ? ['S3_SECRET_ACCESS_KEY'] : ['S3_ACCESS_KEY_ID'],
        message: 'S3 access key ID and secret access key must be supplied together',
      });
    }
  });

export const apiEnvironmentSchema = rawApiEnvironmentSchema.transform((environment) => ({
  nodeEnv: environment.NODE_ENV,
  host: environment.API_HOST,
  port: environment.API_PORT,
  logLevel: environment.LOG_LEVEL,
  corsOrigins: environment.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  databaseUrl: environment.DATABASE_URL,
  databasePoolMax: environment.DATABASE_POOL_MAX,
  redisUrl: environment.REDIS_URL,
  redisConnectTimeoutMs: environment.REDIS_CONNECT_TIMEOUT_MS,
  workerMode: environment.WORKER_MODE,
  s3Endpoint: environment.S3_ENDPOINT,
  s3Region: environment.S3_REGION,
  s3Bucket: environment.S3_BUCKET,
  s3AccessKeyId: environment.S3_ACCESS_KEY_ID,
  s3SecretAccessKey: environment.S3_SECRET_ACCESS_KEY,
  s3ForcePathStyle: environment.S3_FORCE_PATH_STYLE,
  sentryDsn: environment.SENTRY_DSN,
}));

export type ApiEnvironment = z.output<typeof apiEnvironmentSchema>;
export type WorkerMode = z.infer<typeof workerModeSchema>;

export const parseApiEnvironment = (environment: NodeJS.ProcessEnv = process.env): ApiEnvironment =>
  apiEnvironmentSchema.parse(environment);
