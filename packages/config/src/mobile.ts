import { z } from 'zod';

import { publicApiUrlSchema } from './shared.js';

export const mobileEnvironmentSchema = z.object({
  EXPO_PUBLIC_API_URL: publicApiUrlSchema.default('http://localhost:4000/v1'),
});

export type MobileEnvironment = z.infer<typeof mobileEnvironmentSchema>;

export const parseMobileEnvironment = (environment: Record<string, unknown>): MobileEnvironment =>
  mobileEnvironmentSchema.parse(environment);
