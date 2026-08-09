import { z } from 'zod';

import { booleanFromEnvironment, emptyStringToUndefined } from './shared.js';

const secretSchema = z.string().min(32).max(4_096);
const durationSchema = z.coerce.number().int();
const unsafeHostedSecrets = new Set([
  'local-development-access-token-secret-change-me',
  'local-development-mfa-challenge-pepper-change-me',
  'local-development-mfa-recovery-code-pepper-change-me',
  'local-development-password-pepper-change-me',
  'local-development-refresh-token-pepper-change-me',
]);
const localMfaEncryptionKeys = JSON.stringify({
  'local-v1': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
});
const optionalGoogleClientIdSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .max(512)
    .regex(
      /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/u,
      'Google OAuth client IDs must end in .apps.googleusercontent.com',
    )
    .optional(),
);

const rawAuthEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    AUTH_ACCESS_TOKEN_SECRET: secretSchema,
    AUTH_PASSWORD_PEPPER: secretSchema,
    AUTH_REFRESH_TOKEN_PEPPER: secretSchema,
    AUTH_ISSUER: z.string().trim().min(1).max(200).default('go-digital-automobile-crm'),
    AUTH_AUDIENCE: z.string().trim().min(1).max(200).default('go-digital-automobile-crm-clients'),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: durationSchema.min(60).max(3_600).default(900),
    AUTH_REFRESH_TOKEN_TTL_SECONDS: durationSchema
      .min(3_600)
      .max(60 * 60 * 24 * 90)
      .default(60 * 60 * 24 * 30),
    AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS: durationSchema.min(300).max(86_400).default(1_800),
    AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    AUTH_LOGIN_LOCKOUT_SECONDS: durationSchema.min(30).max(86_400).default(900),
    AUTH_MFA_ACTIVE_KEY_ID: z.string().trim().min(1).max(64).default('local-v1'),
    AUTH_MFA_CHALLENGE_PEPPER: secretSchema.default(
      'local-development-mfa-challenge-pepper-change-me',
    ),
    AUTH_MFA_CHALLENGE_TTL_SECONDS: durationSchema.min(60).max(600).default(300),
    AUTH_MFA_ENCRYPTION_KEYS: z.string().trim().default(localMfaEncryptionKeys),
    AUTH_MFA_ISSUER: z.string().trim().min(1).max(200).default('Go Digital Automobile CRM'),
    AUTH_MFA_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    AUTH_MFA_RECOVERY_CODE_PEPPER: secretSchema.default(
      'local-development-mfa-recovery-code-pepper-change-me',
    ),
    AUTH_SUPPORT_ELEVATION_TTL_SECONDS: durationSchema.min(60).max(3_600).default(900),
    AUTH_REFRESH_COOKIE_NAME: z.string().trim().min(1).max(128).default('gdm_refresh'),
    AUTH_REFRESH_COOKIE_DOMAIN: z.preprocess(
      emptyStringToUndefined,
      z.string().trim().min(1).max(253).optional(),
    ),
    AUTH_REFRESH_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
    AUTH_REFRESH_COOKIE_SECURE: z.preprocess(
      emptyStringToUndefined,
      booleanFromEnvironment.optional(),
    ),
    GOOGLE_AUTH_WEB_CLIENT_ID: optionalGoogleClientIdSchema,
    GOOGLE_AUTH_CHALLENGE_TTL_SECONDS: durationSchema.min(60).max(600).default(300),
  })
  .transform((environment, context) => {
    let untrustedMfaKeys: unknown;
    try {
      untrustedMfaKeys = JSON.parse(environment.AUTH_MFA_ENCRYPTION_KEYS);
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MFA_ENCRYPTION_KEYS'],
        message: 'AUTH_MFA_ENCRYPTION_KEYS must be a JSON object.',
      });
      return z.NEVER;
    }

    const parsedMfaKeys = z
      .record(
        z
          .string()
          .trim()
          .min(1)
          .max(64)
          .regex(/^[A-Za-z0-9._-]+$/u),
        z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9+/]{43}=$/u),
      )
      .safeParse(untrustedMfaKeys);
    if (!parsedMfaKeys.success || Object.keys(parsedMfaKeys.data).length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MFA_ENCRYPTION_KEYS'],
        message: 'AUTH_MFA_ENCRYPTION_KEYS must map key IDs to base64 32-byte keys.',
      });
      return z.NEVER;
    }
    if (Object.keys(parsedMfaKeys.data).length > 10) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MFA_ENCRYPTION_KEYS'],
        message: 'AUTH_MFA_ENCRYPTION_KEYS supports at most 10 active or previous keys.',
      });
      return z.NEVER;
    }
    for (const encodedKey of Object.values(parsedMfaKeys.data)) {
      if (Buffer.from(encodedKey, 'base64').length !== 32) {
        context.addIssue({
          code: 'custom',
          path: ['AUTH_MFA_ENCRYPTION_KEYS'],
          message: 'Every MFA encryption key must decode to exactly 32 bytes.',
        });
        return z.NEVER;
      }
    }
    if (!(environment.AUTH_MFA_ACTIVE_KEY_ID in parsedMfaKeys.data)) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MFA_ACTIVE_KEY_ID'],
        message: 'AUTH_MFA_ACTIVE_KEY_ID must identify a configured encryption key.',
      });
      return z.NEVER;
    }

    return {
      nodeEnv: environment.NODE_ENV,
      accessTokenSecret: environment.AUTH_ACCESS_TOKEN_SECRET,
      passwordPepper: environment.AUTH_PASSWORD_PEPPER,
      refreshTokenPepper: environment.AUTH_REFRESH_TOKEN_PEPPER,
      issuer: environment.AUTH_ISSUER,
      audience: environment.AUTH_AUDIENCE,
      accessTokenTtlSeconds: environment.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: environment.AUTH_REFRESH_TOKEN_TTL_SECONDS,
      passwordResetTokenTtlSeconds: environment.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS,
      loginMaxAttempts: environment.AUTH_LOGIN_MAX_ATTEMPTS,
      loginLockoutSeconds: environment.AUTH_LOGIN_LOCKOUT_SECONDS,
      supportElevationTtlSeconds: environment.AUTH_SUPPORT_ELEVATION_TTL_SECONDS,
      mfaActiveKeyId: environment.AUTH_MFA_ACTIVE_KEY_ID,
      mfaChallengePepper: environment.AUTH_MFA_CHALLENGE_PEPPER,
      mfaChallengeTtlSeconds: environment.AUTH_MFA_CHALLENGE_TTL_SECONDS,
      mfaEncryptionKeys: Object.freeze(parsedMfaKeys.data),
      mfaIssuer: environment.AUTH_MFA_ISSUER,
      mfaMaxAttempts: environment.AUTH_MFA_MAX_ATTEMPTS,
      mfaRecoveryCodePepper: environment.AUTH_MFA_RECOVERY_CODE_PEPPER,
      refreshCookieName: environment.AUTH_REFRESH_COOKIE_NAME,
      refreshCookieDomain: environment.AUTH_REFRESH_COOKIE_DOMAIN,
      refreshCookieSameSite: environment.AUTH_REFRESH_COOKIE_SAME_SITE,
      refreshCookieSecure:
        environment.AUTH_REFRESH_COOKIE_SECURE ??
        (environment.NODE_ENV === 'staging' || environment.NODE_ENV === 'production'),
      googleClientIds: environment.GOOGLE_AUTH_WEB_CLIENT_ID
        ? [environment.GOOGLE_AUTH_WEB_CLIENT_ID]
        : [],
      googleWebClientId: environment.GOOGLE_AUTH_WEB_CLIENT_ID,
      googleChallengeTtlSeconds: environment.GOOGLE_AUTH_CHALLENGE_TTL_SECONDS,
    };
  })
  .superRefine((environment, context) => {
    const isHosted = environment.nodeEnv === 'staging' || environment.nodeEnv === 'production';

    if (isHosted && environment.googleWebClientId === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['GOOGLE_AUTH_WEB_CLIENT_ID'],
        message: 'Hosted environments require a Google web OAuth client ID',
      });
    }

    if (isHosted && !environment.refreshCookieSecure) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_REFRESH_COOKIE_SECURE'],
        message: 'Hosted environments require a Secure refresh cookie',
      });
    }

    if (environment.refreshCookieSameSite === 'none' && !environment.refreshCookieSecure) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_REFRESH_COOKIE_SECURE'],
        message: 'A SameSite=None refresh cookie must be Secure',
      });
    }

    if (isHosted) {
      for (const [path, secret] of [
        ['AUTH_ACCESS_TOKEN_SECRET', environment.accessTokenSecret],
        ['AUTH_MFA_CHALLENGE_PEPPER', environment.mfaChallengePepper],
        ['AUTH_MFA_RECOVERY_CODE_PEPPER', environment.mfaRecoveryCodePepper],
        ['AUTH_PASSWORD_PEPPER', environment.passwordPepper],
        ['AUTH_REFRESH_TOKEN_PEPPER', environment.refreshTokenPepper],
      ] as const) {
        if (
          unsafeHostedSecrets.has(secret) ||
          /(?:change[-_ ]?me|example|placeholder)/iu.test(secret)
        ) {
          context.addIssue({
            code: 'custom',
            path: [path],
            message: `${path} must not use a committed placeholder in hosted environments`,
          });
        }
      }

      if (
        new Set([
          environment.accessTokenSecret,
          environment.mfaChallengePepper,
          environment.mfaRecoveryCodePepper,
          environment.passwordPepper,
          environment.refreshTokenPepper,
        ]).size !== 5
      ) {
        context.addIssue({
          code: 'custom',
          path: ['AUTH_ACCESS_TOKEN_SECRET'],
          message: 'Hosted authentication and MFA peppers must be independent',
        });
      }

      if (
        environment.mfaActiveKeyId === 'local-v1' ||
        environment.mfaEncryptionKeys[environment.mfaActiveKeyId] ===
          'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
      ) {
        context.addIssue({
          code: 'custom',
          path: ['AUTH_MFA_ENCRYPTION_KEYS'],
          message: 'Hosted environments require a non-development MFA encryption keyring',
        });
      }
    }
  });

export const authEnvironmentSchema = rawAuthEnvironmentSchema;

export type AuthEnvironment = z.output<typeof authEnvironmentSchema>;

export const parseAuthEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): AuthEnvironment => authEnvironmentSchema.parse(environment);
