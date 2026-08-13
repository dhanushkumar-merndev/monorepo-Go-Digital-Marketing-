import { describe, expect, it } from 'vitest';

import { parseApiEnvironment } from './api.js';
import { parseAuthEnvironment } from './auth.js';
import { parseDeliveryEnvironment } from './delivery.js';
import { parseLeadEnvironment } from './leads.js';
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
const hostedAuthSecrets = {
  AUTH_ACCESS_TOKEN_SECRET: '8cc13fdb690550806979f1f8636cc04565524e00a5f17c9068dcf27f2b226f45',
  AUTH_MFA_ACTIVE_KEY_ID: 'hosted-v1',
  AUTH_MFA_CHALLENGE_PEPPER: '43d960ce7b117db4e1de377c94ec3d4bc5660bc0055255394f9296a2e6a6c1c7',
  AUTH_MFA_ENCRYPTION_KEYS: '{"hosted-v1":"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE="}',
  AUTH_MFA_RECOVERY_CODE_PEPPER: '7370f9e56c90f2b4a2b99f66ed02f7a2154b95d34efc4927ec54b24e5d3c936d',
  AUTH_PASSWORD_PEPPER: 'b4342d3af85233be3d4b8ad22870a9880be1648d51011ed98db1db203b2262d8',
  AUTH_REFRESH_TOKEN_PEPPER: 'd2bf98d6a27c8fa5882144306b466fac8977027523139969d1b8fb84a116a299',
};
const validHostedServerEnvironment = {
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://office.example.com',
  DATABASE_URL: 'postgresql://postgres:secret@db.example.com/crm',
  REDIS_URL: 'rediss://default:secret@redis.example.com:6379',
  RELEASE_ID: '0123456789abcdef',
  TIGRIS_ACCESS_KEY_ID: 'hosted-access-key',
  TIGRIS_BUCKET: 'crm-private',
  TIGRIS_SECRET_ACCESS_KEY: 'hosted-secret-key',
};

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
        MESSAGING_CREDENTIAL_DECRYPTION_KEYS: JSON.stringify({
          'messaging-old': Buffer.alloc(32, 6).toString('base64'),
        }),
        MESSAGING_CREDENTIAL_ENCRYPTION_KEY: key,
        NODE_ENV: 'production',
      }),
    ).toMatchObject({
      credentialDecryptionKeys: { 'messaging-old': Buffer.alloc(32, 6) },
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
    expect(() => parseMessagingEnvironment({ NODE_ENV: 'production' })).toThrow(
      /MESSAGING_CREDENTIAL_ENCRYPTION_KEY/u,
    );
    expect(() =>
      parseMessagingEnvironment({
        MESSAGING_CREDENTIAL_DECRYPTION_KEYS: '{not-json',
        MESSAGING_CREDENTIAL_ENCRYPTION_KEY: key,
      }),
    ).toThrow(/JSON object/u);
    expect(() =>
      parseMessagingEnvironment({
        MESSAGING_CREDENTIAL_DECRYPTION_KEYS: JSON.stringify({
          'messaging-v1': Buffer.alloc(32, 6).toString('base64'),
        }),
        MESSAGING_CREDENTIAL_ENCRYPTION_KEY: key,
      }),
    ).toThrow(/active messaging key ID/u);
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
        ...hostedAuthSecrets,
        AUTH_REFRESH_COOKIE_SAME_SITE: 'none',
        AUTH_REFRESH_COOKIE_SECURE: 'false',
      }),
    ).toThrow();

    expect(
      parseAuthEnvironment({
        NODE_ENV: 'production',
        ...hostedAuthSecrets,
        AUTH_REFRESH_COOKIE_SAME_SITE: 'none',
        GOOGLE_AUTH_WEB_CLIENT_ID: googleWebClientId,
      }).refreshCookieSecure,
    ).toBe(true);
  });

  it('fails closed when a hosted environment explicitly disables secure refresh cookies', () => {
    expect(() =>
      parseAuthEnvironment({
        NODE_ENV: 'production',
        ...hostedAuthSecrets,
        AUTH_REFRESH_COOKIE_SECURE: 'false',
      }),
    ).toThrow();
  });

  it('validates Google audiences and requires a web audience in hosted environments', () => {
    const secrets = hostedAuthSecrets;
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

  it('fails closed on insecure hosted transport and absent release identity', () => {
    expect(() =>
      parseApiEnvironment({
        ...validServerEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'http://localhost:3000',
      }),
    ).toThrow();

    expect(parseApiEnvironment(validHostedServerEnvironment)).toMatchObject({
      corsOrigins: ['https://office.example.com'],
      openApiEnabled: false,
      releaseId: '0123456789abcdef',
      redisUrl: 'rediss://default:secret@redis.example.com:6379',
      sentryDsn: undefined,
    });
    expect(
      parseApiEnvironment({
        ...validHostedServerEnvironment,
        API_OPENAPI_ENABLED: 'true',
      }).openApiEnabled,
    ).toBe(true);
  });

  it('rejects unsafe hosted auth and Lead lookup placeholders', () => {
    expect(() =>
      parseAuthEnvironment({
        NODE_ENV: 'production',
        AUTH_ACCESS_TOKEN_SECRET: 'local-development-access-token-secret-change-me',
        AUTH_PASSWORD_PEPPER: 'local-development-password-pepper-change-me',
        AUTH_REFRESH_TOKEN_PEPPER: 'local-development-refresh-token-pepper-change-me',
        GOOGLE_AUTH_WEB_CLIENT_ID: googleWebClientId,
      }),
    ).toThrow(/placeholder/u);
    expect(() => parseLeadEnvironment({ NODE_ENV: 'production' })).toThrow(
      /LEAD_PHONE_LOOKUP_PEPPER/u,
    );
    expect(
      parseLeadEnvironment({
        NODE_ENV: 'production',
        LEAD_PHONE_LOOKUP_PEPPER:
          '2aec4bd792240f89b237d6cf2ed5518892b3255ddff74d407b39d1ffcd581722',
      }).phoneLookupPepper,
    ).toHaveLength(64);
  });

  it('accepts only exact CORS origins', () => {
    for (const origin of [
      'https://user:secret@office.example.com',
      'https://office.example.com/path',
      'https://office.example.com?tenant=unsafe',
    ]) {
      expect(() =>
        parseApiEnvironment({ ...validServerEnvironment, CORS_ORIGINS: origin }),
      ).toThrow(/CORS origin/u);
    }
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
