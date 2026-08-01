import { z } from 'zod';

import { publicApiUrlSchema } from './shared.js';

export const webEnvironmentSchema = z.object({
  NEXT_PUBLIC_API_URL: publicApiUrlSchema.default('http://localhost:4000/v1'),
});

export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;

export const parseWebEnvironment = (environment: Record<string, unknown>): WebEnvironment =>
  webEnvironmentSchema.parse(environment);
