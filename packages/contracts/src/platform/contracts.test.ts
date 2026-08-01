import { describe, expect, it } from 'vitest';

import { apiErrorEnvelopeSchema, readinessResponseSchema } from '../index.js';

describe('platform contracts', () => {
  it('accepts the standard error envelope', () => {
    const result = apiErrorEnvelopeSchema.safeParse({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input validation failed.',
        correlation_id: 'request-123',
        details: [{ field: 'name', reason: 'required' }],
        retryable: false,
      },
    });

    expect(result.success).toBe(true);
  });

  it('requires both dependency checks for readiness', () => {
    const result = readinessResponseSchema.safeParse({
      status: 'ok',
      service: 'go-digital-automobile-crm-api',
      version: '0.1.0',
      environment: 'test',
      timestamp: new Date().toISOString(),
      uptime_seconds: 1,
      correlation_id: 'request-123',
      processing: {
        mode: 'standalone',
        location: 'external',
        local_workers: 0,
      },
      checks: {
        database: { status: 'up', latency_ms: 2 },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an inconsistent processing location value', () => {
    const result = readinessResponseSchema.safeParse({
      status: 'ok',
      service: 'go-digital-automobile-crm-api',
      version: '0.1.0',
      environment: 'test',
      timestamp: new Date().toISOString(),
      uptime_seconds: 1,
      correlation_id: 'request-123',
      processing: {
        mode: 'embedded',
        location: 'external',
        local_workers: 1,
      },
      checks: {
        database: { status: 'up', latency_ms: 2 },
        redis: { status: 'up', latency_ms: 2 },
      },
    });

    expect(result.success).toBe(false);
  });
});
