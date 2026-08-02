import { z } from 'zod';

import { publicApiUrlSchema } from './shared.js';

const rawWebEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    NEXT_PUBLIC_API_URL: publicApiUrlSchema.optional(),
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
}));

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;

export const parseWebEnvironment = (environment: Record<string, unknown>): WebEnvironment =>
  webEnvironmentSchema.parse(environment);
