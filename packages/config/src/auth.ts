import { z } from 'zod';

import { booleanFromEnvironment, emptyStringToUndefined } from './shared.js';

const secretSchema = z.string().min(32).max(4_096);
const durationSchema = z.coerce.number().int();

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
  })
  .transform((environment) => ({
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
    refreshCookieName: environment.AUTH_REFRESH_COOKIE_NAME,
    refreshCookieDomain: environment.AUTH_REFRESH_COOKIE_DOMAIN,
    refreshCookieSameSite: environment.AUTH_REFRESH_COOKIE_SAME_SITE,
    refreshCookieSecure:
      environment.AUTH_REFRESH_COOKIE_SECURE ??
      (environment.NODE_ENV === 'staging' || environment.NODE_ENV === 'production'),
  }))
  .superRefine((environment, context) => {
    if (
      (environment.nodeEnv === 'staging' || environment.nodeEnv === 'production') &&
      !environment.refreshCookieSecure
    ) {
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
  });

export const authEnvironmentSchema = rawAuthEnvironmentSchema;

export type AuthEnvironment = z.output<typeof authEnvironmentSchema>;

export const parseAuthEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): AuthEnvironment => authEnvironmentSchema.parse(environment);
