import { z } from 'zod';

import { AUTH_ERROR_CODES } from '../auth/errors.js';

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_TRANSITION',
  'IDEMPOTENCY_MISMATCH',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL_ERROR',
  ...AUTH_ERROR_CODES,
]);

export const correlationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, 'Correlation ID contains unsupported characters');

export const apiErrorDetailSchema = z.object({
  field: z.string().min(1).max(256).optional(),
  reason: z.string().min(1).max(1_000),
});

export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    correlation_id: correlationIdSchema,
    details: z.array(apiErrorDetailSchema).default([]),
    retryable: z.boolean(),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;
