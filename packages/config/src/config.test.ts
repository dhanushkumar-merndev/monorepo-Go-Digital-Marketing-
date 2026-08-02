import { describe, expect, it } from 'vitest';

import { parseApiEnvironment } from './api.js';
import { parseMobileEnvironment } from './mobile.js';
import { parseWebEnvironment } from './web.js';

const validServerEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/crm',
  REDIS_URL: 'redis://localhost:6379',
  S3_BUCKET: 'crm-test',
};

describe('environment validation', () => {
  it('parses server configuration and normalizes CORS origins', () => {
    const environment = parseApiEnvironment({
      ...validServerEnvironment,
      CORS_ORIGINS: 'https://office.example.com, https://admin.example.com',
    });

    expect(environment.corsOrigins).toEqual([
      'https://office.example.com',
      'https://admin.example.com',
    ]);
    expect(environment.workerMode).toBe('disabled');
  });

  it.each(['disabled', 'embedded', 'standalone'] as const)(
    'accepts the %s worker processing mode',
    (workerMode) => {
      const environment = parseApiEnvironment({
        ...validServerEnvironment,
        WORKER_MODE: workerMode,
      });

      expect(environment.workerMode).toBe(workerMode);
    },
  );

  it('rejects an unknown worker processing mode', () => {
    expect(() =>
      parseApiEnvironment({ ...validServerEnvironment, WORKER_MODE: 'automatic' }),
    ).toThrow();
  });

  it('uses Render PORT when API_PORT is absent and rejects conflicting port values', () => {
    expect(parseApiEnvironment({ ...validServerEnvironment, PORT: '10000' }).port).toBe(10_000);
    expect(() =>
      parseApiEnvironment({ ...validServerEnvironment, API_PORT: '4000', PORT: '10000' }),
    ).toThrow();
  });

  it('maps a complete Tigris environment onto the provider-neutral S3 adapter', () => {
    const { S3_BUCKET: _, ...withoutGenericStorage } = validServerEnvironment;
    const environment = parseApiEnvironment({
      ...withoutGenericStorage,
      TIGRIS_BUCKET: 'crm-private',
      TIGRIS_ACCESS_KEY_ID: 'access-key',
      TIGRIS_SECRET_ACCESS_KEY: 'secret-key',
    });

    expect(environment).toMatchObject({
      s3Endpoint: 'https://t3.storage.dev',
      s3Region: 'auto',
      s3Bucket: 'crm-private',
      s3AccessKeyId: 'access-key',
      s3SecretAccessKey: 'secret-key',
      s3ForcePathStyle: false,
    });
  });

  it('rejects incomplete or mixed Tigris and generic S3 settings', () => {
    const { S3_BUCKET: _, ...withoutGenericStorage } = validServerEnvironment;

    expect(() =>
      parseApiEnvironment({ ...withoutGenericStorage, TIGRIS_BUCKET: 'crm-private' }),
    ).toThrow();
    expect(() =>
      parseApiEnvironment({
        ...validServerEnvironment,
        TIGRIS_BUCKET: 'crm-private',
        TIGRIS_ACCESS_KEY_ID: 'access-key',
        TIGRIS_SECRET_ACCESS_KEY: 'secret-key',
      }),
    ).toThrow();
  });

  it('rejects a non-PostgreSQL database URL', () => {
    expect(() =>
      parseApiEnvironment({ ...validServerEnvironment, DATABASE_URL: 'mysql://localhost/crm' }),
    ).toThrow();
  });

  it('keeps public mobile configuration free from server secrets', () => {
    const environment = parseMobileEnvironment({
      EXPO_PUBLIC_API_URL: 'https://api.example.com/v1',
      DATABASE_URL: 'postgresql://do-not-expose',
    });

    expect(environment).toEqual({ EXPO_PUBLIC_API_URL: 'https://api.example.com/v1' });
  });

  it.each([
    'ftp://api.example.com/v1',
    'https://user:secret@api.example.com/v1',
    'https://api.example.com/v1?tenant=unsafe',
    'https://api.example.com/v1#fragment',
    'https://api.example.com/v10',
  ])('rejects unsafe public API URL %s', (apiUrl) => {
    expect(() => parseWebEnvironment({ NEXT_PUBLIC_API_URL: apiUrl })).toThrow();
    expect(() => parseMobileEnvironment({ EXPO_PUBLIC_API_URL: apiUrl })).toThrow();
  });

  it('normalizes the optional trailing slash on public API URLs', () => {
    expect(parseWebEnvironment({ NEXT_PUBLIC_API_URL: 'https://api.example.com/v1/' })).toEqual({
      NEXT_PUBLIC_API_URL: 'https://api.example.com/v1',
    });
  });

  it('requires an explicit API URL for production web builds', () => {
    expect(() => parseWebEnvironment({ NODE_ENV: 'production' })).toThrow();
    expect(() =>
      parseWebEnvironment({
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: 'http://api.example.com/v1',
      }),
    ).toThrow();
    expect(
      parseWebEnvironment({
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: 'https://api.example.com/v1',
      }),
    ).toEqual({ NEXT_PUBLIC_API_URL: 'https://api.example.com/v1' });
    expect(
      parseWebEnvironment({
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: 'http://localhost:4000/v1',
      }),
    ).toEqual({ NEXT_PUBLIC_API_URL: 'http://localhost:4000/v1' });
  });
});
