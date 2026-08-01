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
    expect(
      parseWebEnvironment({ NEXT_PUBLIC_API_URL: 'https://api.example.com/v1/' }),
    ).toEqual({ NEXT_PUBLIC_API_URL: 'https://api.example.com/v1' });
  });
});
