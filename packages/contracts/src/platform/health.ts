import { z } from 'zod';

import { correlationIdSchema } from './api-error.js';

export const healthStatusSchema = z.enum(['ok', 'degraded', 'down']);

export const backgroundProcessingSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('disabled'),
    location: z.literal('disabled'),
    local_workers: z.literal(0),
  }),
  z.object({
    mode: z.literal('embedded'),
    location: z.literal('local'),
    local_workers: z.number().int().positive(),
  }),
  z.object({
    mode: z.literal('standalone'),
    location: z.literal('external'),
    local_workers: z.literal(0),
  }),
]);

export const dependencyCheckSchema = z.object({
  status: z.enum(['up', 'down']),
  latency_ms: z.number().nonnegative(),
  message: z.string().min(1).optional(),
});

const healthBaseSchema = z.object({
  status: healthStatusSchema,
  service: z.literal('go-digital-automobile-crm-api'),
  version: z.string().min(1),
  environment: z.enum(['development', 'test', 'staging', 'production']),
  timestamp: z.iso.datetime({ offset: true }),
  uptime_seconds: z.number().nonnegative(),
  correlation_id: correlationIdSchema,
  processing: backgroundProcessingSchema,
});

export const healthOverviewSchema = healthBaseSchema;

export const livenessResponseSchema = healthBaseSchema.extend({
  status: z.literal('ok'),
});

export const readinessResponseSchema = healthBaseSchema.extend({
  checks: z.object({
    database: dependencyCheckSchema,
    redis: dependencyCheckSchema,
  }),
});

export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;
export type BackgroundProcessing = z.infer<typeof backgroundProcessingSchema>;
export type HealthOverview = z.infer<typeof healthOverviewSchema>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
