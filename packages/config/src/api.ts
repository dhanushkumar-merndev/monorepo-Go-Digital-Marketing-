import { z } from 'zod';
import { isIP } from 'node:net';

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

const hostedEnvironment = (nodeEnvironment: string): boolean =>
  nodeEnvironment === 'staging' || nodeEnvironment === 'production';

function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isExactHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '' &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

const trustedProxySchema = z
  .string()
  .trim()
  .refine((value) => {
    const [address, prefix, ...remainder] = value.split('/');
    const version = address ? isIP(address) : 0;

    if (version === 0 || remainder.length > 0) {
      return false;
    }

    if (prefix === undefined) {
      return true;
    }

    if (!/^\d+$/u.test(prefix)) {
      return false;
    }

    const prefixLength = Number(prefix);
    return prefixLength <= (version === 4 ? 32 : 128);
  }, 'Trusted proxies must be explicit IP addresses or CIDR ranges');

const trustedProxyListSchema = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  .pipe(z.array(trustedProxySchema).max(64));

const rawApiEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    API_HOST: z.string().trim().min(1).default('0.0.0.0'),
    API_PORT: portSchema.optional(),
    PORT: portSchema.optional(),
    API_TRUSTED_PROXIES: trustedProxyListSchema,
    API_OPENAPI_ENABLED: z.preprocess(emptyStringToUndefined, booleanFromEnvironment.optional()),
    RELEASE_ID: z.preprocess(emptyStringToUndefined, z.string().trim().min(7).max(128).optional()),
    RENDER_GIT_COMMIT: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(7).max(128).optional(),
    ),
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
    const isHosted = hostedEnvironment(environment.NODE_ENV);

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

    const corsOrigins = parseCorsOrigins(environment.CORS_ORIGINS);
    if (corsOrigins.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must contain at least one exact HTTP(S) origin',
      });
    }
    for (const origin of corsOrigins) {
      if (!isExactHttpOrigin(origin)) {
        context.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `CORS origin ${origin} must be an exact HTTP(S) origin without credentials, path, query or fragment`,
        });
        continue;
      }
      if (
        isHosted &&
        (new URL(origin).protocol !== 'https:' ||
          ['localhost', '127.0.0.1', '::1'].includes(new URL(origin).hostname))
      ) {
        context.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'Hosted CORS origins must use HTTPS and cannot target localhost',
        });
      }
    }

    if (isHosted && new URL(environment.REDIS_URL).protocol !== 'rediss:') {
      context.addIssue({
        code: 'custom',
        path: ['REDIS_URL'],
        message: 'Hosted environments require an encrypted rediss:// Redis connection',
      });
    }

    const selectedStorageEndpoint = hasTigrisStorage
      ? (environment.TIGRIS_ENDPOINT ?? DEFAULT_TIGRIS_ENDPOINT)
      : environment.S3_ENDPOINT;
    if (
      isHosted &&
      selectedStorageEndpoint !== undefined &&
      new URL(selectedStorageEndpoint).protocol !== 'https:'
    ) {
      context.addIssue({
        code: 'custom',
        path: [hasTigrisStorage ? 'TIGRIS_ENDPOINT' : 'S3_ENDPOINT'],
        message: 'Hosted object storage endpoints must use HTTPS',
      });
    }

    if (
      isHosted &&
      environment.RELEASE_ID === undefined &&
      environment.RENDER_GIT_COMMIT === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['RELEASE_ID'],
        message: 'Hosted environments require RELEASE_ID or RENDER_GIT_COMMIT',
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
    trustedProxies: environment.API_TRUSTED_PROXIES,
    openApiEnabled: environment.API_OPENAPI_ENABLED ?? !hostedEnvironment(environment.NODE_ENV),
    releaseId: environment.RELEASE_ID ?? environment.RENDER_GIT_COMMIT ?? 'local-development',
    logLevel: environment.LOG_LEVEL,
    corsOrigins: parseCorsOrigins(environment.CORS_ORIGINS),
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
