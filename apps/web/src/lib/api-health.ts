import { z } from 'zod';

import { publicEnvironment } from '@/lib/env';

const healthPayloadSchema = z
  .object({
    checks: z.record(z.string().min(1).max(64), z.unknown()).optional(),
    status: z.string().trim().min(1).max(32),
  })
  .passthrough();

export interface ApiHealthCheck {
  name: string;
  status: string;
}

export interface ApiHealthResult {
  checkedAt: string;
  checks: ApiHealthCheck[];
  endpoint: string;
  httpStatus: number;
  status: string;
}

export class ApiHealthRequestError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ApiHealthRequestError';
  }
}

function normalizeStatusText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 && normalizedValue.length <= 32 ? normalizedValue : undefined;
}

function normalizeCheckStatus(value: unknown): string {
  const directStatus = normalizeStatusText(value);

  if (directStatus !== undefined) {
    return directStatus;
  }

  if (typeof value === 'boolean') {
    return value ? 'up' : 'down';
  }

  if (typeof value === 'object' && value !== null && 'status' in value) {
    const status = normalizeStatusText(value.status);

    if (status !== undefined) {
      return status;
    }
  }

  return 'reported';
}

export async function fetchApiHealth(signal?: AbortSignal): Promise<ApiHealthResult> {
  const endpoint = `${publicEnvironment.apiBaseUrl}/health`;
  let response: Response;

  try {
    const requestInit: RequestInit = {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    };

    if (signal !== undefined) {
      requestInit.signal = signal;
    }

    response = await fetch(endpoint, requestInit);
  } catch {
    throw new ApiHealthRequestError('The API could not be reached.');
  }

  let body: unknown = null;

  try {
    body = (await response.json()) as unknown;
  } catch {
    body = null;
  }

  const payload = healthPayloadSchema.safeParse(body);

  if (!payload.success) {
    throw new ApiHealthRequestError(
      `The API health endpoint returned an invalid HTTP ${response.status} response.`,
      response.status,
    );
  }

  const checks = Object.entries(payload.data.checks ?? {})
    .map(([name, status]) => ({ name, status: normalizeCheckStatus(status) }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const result: ApiHealthResult = {
    checkedAt: new Date().toISOString(),
    checks,
    endpoint,
    httpStatus: response.status,
    status: payload.data.status,
  };

  return result;
}
