import { apiErrorEnvelopeSchema, type ApiErrorCode } from '@gdm/contracts';

export const disabledAuthReasons = [
  'CLIENT_SUSPENDED',
  'MEMBERSHIP_INACTIVE',
  'USER_SUSPENDED',
] as const;

export const expiredSessionReasons = [
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REUSED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
] as const;

export type DisabledAuthReason = (typeof disabledAuthReasons)[number];
export type ExpiredSessionReason = (typeof expiredSessionReasons)[number];
export type AuthFailureReason =
  DisabledAuthReason | ExpiredSessionReason | 'INVALID_CREDENTIALS' | 'UNKNOWN';

const authReasonAliases: Readonly<Record<string, AuthFailureReason>> = {
  ACCOUNT_DISABLED: 'USER_SUSPENDED',
  ACCOUNT_SUSPENDED: 'USER_SUSPENDED',
  CLIENT_INACTIVE: 'CLIENT_SUSPENDED',
  CLIENT_SUSPENDED: 'CLIENT_SUSPENDED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN: 'REFRESH_TOKEN_INVALID',
  MEMBERSHIP_DISABLED: 'MEMBERSHIP_INACTIVE',
  MEMBERSHIP_INACTIVE: 'MEMBERSHIP_INACTIVE',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  USER_DISABLED: 'USER_SUSPENDED',
  USER_SUSPENDED: 'USER_SUSPENDED',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safeString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const normalizedReason = (value: unknown): AuthFailureReason => {
  const raw = safeString(value)?.toUpperCase();
  return raw ? (authReasonAliases[raw] ?? 'UNKNOWN') : 'UNKNOWN';
};

export class NetworkRequestError extends Error {
  constructor(options?: ErrorOptions) {
    super('The API could not be reached', options);
    this.name = 'NetworkRequestError';
  }
}

export class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | string,
    readonly reason: AuthFailureReason,
    readonly correlationId?: string,
    readonly retryable = false,
  ) {
    super('The API rejected the request');
    this.name = 'ApiResponseError';
  }
}

export class InvalidApiResponseError extends Error {
  constructor() {
    super('The API returned an invalid response');
    this.name = 'InvalidApiResponseError';
  }
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text.length > 0 ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

function reasonFromErrorRecord(error: Record<string, unknown>): AuthFailureReason {
  const directReason = normalizedReason(error.reason ?? error.auth_reason);
  if (directReason !== 'UNKNOWN') {
    return directReason;
  }

  if (!Array.isArray(error.details)) {
    return normalizedReason(error.code);
  }

  for (const detail of error.details) {
    if (!isRecord(detail)) {
      continue;
    }

    const field = safeString(detail.field)?.toLowerCase();
    if (field === 'auth_reason' || field === 'reason') {
      const detailReason = normalizedReason(detail.reason);
      if (detailReason !== 'UNKNOWN') {
        return detailReason;
      }
    }
  }

  return normalizedReason(error.code);
}

export async function apiResponseError(response: Response): Promise<ApiResponseError> {
  const payload = await responseJson(response);
  const parsed = apiErrorEnvelopeSchema.safeParse(payload);

  if (parsed.success) {
    const error = parsed.data.error;
    return new ApiResponseError(
      response.status,
      error.code,
      reasonFromErrorRecord(error),
      error.correlation_id,
      error.retryable,
    );
  }

  if (isRecord(payload) && isRecord(payload.error)) {
    const error = payload.error;
    return new ApiResponseError(
      response.status,
      safeString(error.code) ?? 'UNKNOWN',
      reasonFromErrorRecord(error),
      safeString(error.correlation_id),
      error.retryable === true,
    );
  }

  return new ApiResponseError(response.status, 'UNKNOWN', 'UNKNOWN');
}

export function isDisabledAuthFailure(
  error: unknown,
): error is ApiResponseError & { reason: DisabledAuthReason } {
  return (
    error instanceof ApiResponseError &&
    (disabledAuthReasons as readonly AuthFailureReason[]).includes(error.reason)
  );
}

export function isExpiredSessionFailure(error: unknown): error is ApiResponseError {
  return (
    error instanceof ApiResponseError &&
    ((expiredSessionReasons as readonly AuthFailureReason[]).includes(error.reason) ||
      error.status === 401)
  );
}
