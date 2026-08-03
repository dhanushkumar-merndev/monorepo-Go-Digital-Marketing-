import { z } from 'zod';

import { publicApiUrlSchema } from './shared.js';

const googleWebClientIdSchema = z
  .string()
  .trim()
  .min(20)
  .max(255)
  .regex(
    /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/u,
    'NEXT_PUBLIC_GOOGLE_CLIENT_ID must be a Google OAuth web client ID',
  );

const rawWebEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    NEXT_PUBLIC_API_URL: publicApiUrlSchema.optional(),
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleWebClientIdSchema.optional(),
  })
  .superRefine((environment, context) => {
    if (
      (environment.NODE_ENV === 'production' || environment.NODE_ENV === 'staging') &&
      environment.NEXT_PUBLIC_API_URL === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_API_URL'],
        message: 'NEXT_PUBLIC_API_URL is required for staging and production web builds',
      });
    }

    if (
      (environment.NODE_ENV === 'production' || environment.NODE_ENV === 'staging') &&
      environment.NEXT_PUBLIC_GOOGLE_CLIENT_ID === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_GOOGLE_CLIENT_ID'],
        message: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID is required for staging and production web builds',
      });
    }

    if (
      (environment.NODE_ENV === 'production' || environment.NODE_ENV === 'staging') &&
      environment.NEXT_PUBLIC_API_URL !== undefined
    ) {
      const apiUrl = new URL(environment.NEXT_PUBLIC_API_URL);
      const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(apiUrl.hostname);

      if (apiUrl.protocol !== 'https:' && !isLoopback) {
        context.addIssue({
          code: 'custom',
          path: ['NEXT_PUBLIC_API_URL'],
          message: 'Staging and production API URLs must use HTTPS',
        });
      }
    }
  });

export const webEnvironmentSchema = rawWebEnvironmentSchema.transform((environment) => ({
  NEXT_PUBLIC_API_URL: environment.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1',
  ...(environment.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    ? { NEXT_PUBLIC_GOOGLE_CLIENT_ID: environment.NEXT_PUBLIC_GOOGLE_CLIENT_ID }
    : {}),
}));

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;

export const parseWebEnvironment = (environment: Record<string, unknown>): WebEnvironment =>
  webEnvironmentSchema.parse(environment);
