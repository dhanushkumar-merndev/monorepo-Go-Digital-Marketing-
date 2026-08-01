import { randomUUID } from 'node:crypto';
import { correlationIdSchema } from '@gdm/contracts';
import type { Request, Response } from 'express';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export type CorrelatedRequest = Request & {
  correlationId?: string;
  id?: string;
};

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeCorrelationId(value: string | string[] | undefined): string | undefined {
  const candidate = firstHeaderValue(value)?.trim();
  const parsed = correlationIdSchema.safeParse(candidate);

  return parsed.success ? parsed.data : undefined;
}

export function resolveCorrelationId(request: CorrelatedRequest): string {
  const current = normalizeCorrelationId(request.correlationId ?? request.id);
  const fromHeader = normalizeCorrelationId(request.headers[CORRELATION_ID_HEADER]);
  const correlationId = current ?? fromHeader ?? randomUUID();

  request.id = correlationId;
  request.correlationId = correlationId;

  return correlationId;
}

export function attachCorrelationId(request: CorrelatedRequest, response: Response): string {
  const correlationId = resolveCorrelationId(request);

  if (!response.headersSent) {
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
  }

  return correlationId;
}
