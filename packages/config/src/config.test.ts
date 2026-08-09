import { describe, expect, it } from 'vitest';

import { parseApiEnvironment } from './api.js';
import { parseAuthEnvironment } from './auth.js';
import { parseDeliveryEnvironment } from './delivery.js';
import { parseMobileEnvironment } from './mobile.js';
import { parseMessagingEnvironment } from './messaging.js';
import { parseTestRideEnvironment } from './test-rides.js';
import { parseWebEnvironment } from './web.js';

const validServerEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/crm',
  REDIS_URL: 'redis://localhost:6379',
  S3_BUCKET: 'crm-test',
};
const googleWebClientId = '123456789-webclient.apps.googleusercontent.com';

describe('environment validation', () => {
  it('keeps the delivery OTP pepper backend-only and rejects the local default in production', () => {
    expect(
      parseDeliveryEnvironment({
        DELIVERY_OTP_PEPPER: 'hosted-delivery-otp-pepper-at-least-32-characters',
        NODE_ENV: 'production',
      }),
    ).toEqual({ otpPepper: 'hosted-delivery-otp-pepper-at-least-32-characters' });
    expect(() => parseDeliveryEnvironment({ NODE_ENV: 'production' })).toThrow(
      /DELIVERY_OTP_PEPPER/u,
    );
  });

  it('bounds Phase 6 tracking settings and requires a hosted OTP pepper', () => {
    expect(
      parseTestRideEnvironment({
        NODE_ENV: 'production',
        TEST_RIDE_ACTIVE_TIMEOUT_MINUTES: '240',
        TEST_RIDE_LOCATION_RETENTION_DAYS: '14',
        TEST_RIDE_LOCATION_STALE_SECONDS: '180',
        TEST_RIDE_OTP_PEPPER: 'hosted-test-ride-otp-pepper-at-least-32-characters',
      }),
    ).toMatchObject({
      activeTimeoutMinutes: 240,
      locationRetentionDays: 14,
      locationStaleSeconds: 180,
    });
    expect(() => parseTestRideEnvironment({ NODE_ENV: 'production' })).toThrow(
      /TEST_RIDE_OTP_PEPPER/u,
    );
    expect(() => parseTestRideEnvironment({ TEST_RIDE_LOCATION_STALE_SECONDS: '30' })).toThrow();
  });

  it('validates the backend-only Phase 5 credential key and disables fixtures in production', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    expect(
      parseMessagingEnvironment({
        MESSAGING_CREDENTIAL_ENCRYPTION_KEY: key,
        NODE_ENV: 'production',
      }),
    ).toMatchObject({
      credentialEncryptionKey: Buffer.alloc(32, 7),
      developmentAdapterEnabled: false,
      mediaRetentionDays: 365,
      serviceWindowHours: 24,
    });
    expect(() =>
      parseMessagingEnvironment({
        MESSAGING_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(31).toString('base64'),
      }),
    ).toThrow(/exactly 32 bytes/u);
  });

  it('parses API-only authentication settings without changing worker infrastructure config', () => {
    const environment = parseAuthEnvironment({
      NODE_ENV: 'test',
      AUTH_ACCESS_TOKEN_SECRET: 'test-access-token-secret-at-least-32-characters',
      AUTH_PASSWORD_PEPPER: 'test-password-pepper-at-least-32-characters',
      AUTH_REFRESH_TOKEN_PEPPER: 'test-refresh-token-pepper-at-least-32-characters',
    });

    expect(environment).toMatchObject({
      accessTokenTtlSeconds: 900,
      refreshTokenTtlSeconds: 2_592_000,
      passwordResetTokenTtlSeconds: 1_800,
      supportElevationTtlSeconds: 900,
      refreshCookieName: 'gdm_refresh',
      refreshCookieSameSite: 'lax',
      refreshCookieSecure: false,
    });
    expect(() => parseApiEnvironment(validServerEnvironment)).not.toThrow();
  });

  it('requires strong API auth secrets and bounds security lifetimes', () => {
    expect(() =>
      parseAuthEnvironment({
        NODE_ENV: 'test',
        AUTH_ACCESS_TOKEN_SECRET: 'short',
        AUTH_PASSWORD_PEPPER: 'also-short',
        AUTH_REFRESH_TOKEN_PEPPER: 'short-too',
      }),
    ).toThrow();
    expect(() =>
      parseAuthEnvironment({
        NODE_ENV: 'test',
        AUTH_ACCESS_TOKEN_SECRET: 'test-access-token-secret-at-least-32-characters',
        AUTH_PASSWORD_PEPPER: 'test-password-pepper-at-least-32-characters',
        AUTH_REFRESH_TOKEN_PEPPER: 'test-refresh-token-pepper-at-least-32-characters',
        AUTH_ACCESS_TOKEN_TTL_SECONDS: '7200',
      }),
    ).toThrow();
  });

  it('requires Secure when the refresh cookie uses SameSite=None', () => {
    expect(() =>
      parseAuthEnvironment({
        NODE_ENV: 'production',
        AUTH_ACCESS_TOKEN_SECRET: 'test-access-token-secret-at-least-32-characters',
        AUTH_PASSWORD_PEPPER: 'test-password-pepper-at-least-32-characters',
        AUTH_REFRESH_TOKEN_PEPPER: 'test-refresh-token-pepper-at-least-32-characters',
        AUTH_REFRESH_COOKIE_SAME_SITE: 'none',
        AUTH_REFRESH_COOKIE_SECURE: 'false',
      }),
    ).toThrow();

    expect(
      parseAuthEnvironment({
        NODE_ENV: 'production',
        AUTH_ACCESS_TOKEN_SECRET: 'test-access-token-secret-at-least-32-characters',
        AUTH_PASSWORD_PEPPER: 'test-password-pepper-at-least-32-characters',
        AUTH_REFRESH_TOKEN_PEPPER: 'test-refresh-token-pepper-at-least-32-characters',
        AUTH_REFRESH_COOKIE_SAME_SITE: 'none',
        GOOGLE_AUTH_WEB_CLIENT_ID: googleWebClientId,
      }).refreshCookieSecure,
    ).toBe(true);
  });

  it('fails closed when a hosted environment explicitly disables secure refresh cookies', () => {
    expect(() =>
      parseAuthEnvironment({
        NODE_ENV: 'production',
        AUTH_ACCESS_TOKEN_SECRET: 'test-access-token-secret-at-least-32-characters',
        AUTH_PASSWORD_PEPPER: 'test-password-pepper-at-least-32-characters',
        AUTH_REFRESH_TOKEN_PEPPER: 'test-refresh-token-pepper-at-least-32-characters',
        AUTH_REFRESH_COOKIE_SECURE: 'false',
      }),
    ).toThrow();
  });

  it('validates Google audiences and requires a web audience in hosted environments', () => {
    const secrets = {
      AUTH_ACCESS_TOKEN_SECRET: 'test-access-token-secret-at-least-32-characters',
      AUTH_PASSWORD_PEPPER: 'test-password-pepper-at-least-32-characters',
      AUTH_REFRESH_TOKEN_PEPPER: 'test-refresh-token-pepper-at-least-32-characters',
    };
    expect(() => parseAuthEnvironment({ ...secrets, NODE_ENV: 'production' })).toThrow();
    expect(() =>
      parseAuthEnvironment({
        ...secrets,
        GOOGLE_AUTH_WEB_CLIENT_ID: 'invalid-client-id',
      }),
    ).toThrow();
    expect(
      parseAuthEnvironment({
        ...secrets,
        NODE_ENV: 'production',
        GOOGLE_AUTH_WEB_CLIENT_ID: googleWebClientId,
      }).googleClientIds,
    ).toEqual([googleWebClientId]);
  });

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

  it('accepts only explicit IP or CIDR trusted proxies', () => {
    expect(
      parseApiEnvironment({
        ...validServerEnvironment,
        API_TRUSTED_PROXIES: '127.0.0.1/32, ::1',
      }).trustedProxies,
    ).toEqual(['127.0.0.1/32', '::1']);

    for (const value of ['true', '*', 'proxy.example.com', '10.0.0.0/33']) {
      expect(() =>
        parseApiEnvironment({ ...validServerEnvironment, API_TRUSTED_PROXIES: value }),
      ).toThrow();
    }
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
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleWebClientId,
      }),
    ).toEqual({
      NEXT_PUBLIC_API_URL: 'https://api.example.com/v1',
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleWebClientId,
    });
    expect(
      parseWebEnvironment({
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_URL: 'http://localhost:4000/v1',
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleWebClientId,
      }),
    ).toEqual({
      NEXT_PUBLIC_API_URL: 'http://localhost:4000/v1',
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleWebClientId,
    });
  });

  it('validates and exposes only the browser-safe Google web client ID', () => {
    expect(() =>
      parseWebEnvironment({ NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'not-a-google-client' }),
    ).toThrow();
    expect(
      parseWebEnvironment({
        GOOGLE_AUTH_WEB_CLIENT_SECRET: 'must-not-be-returned',
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleWebClientId,
      }),
    ).toEqual({
      NEXT_PUBLIC_API_URL: 'http://localhost:4000/v1',
      NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleWebClientId,
    });
  });
});
