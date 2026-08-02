import { publicEnvironment } from '@/lib/env';
import {
  createSupportElevationRequestSchema,
  clientOrganizationListResponseSchema,
  forgotPasswordResponseSchema,
  loginResponseSchema,
  logoutAllResponseSchema,
  logoutResponseSchema,
  meResponseSchema,
  refreshResponseSchema,
  resetPasswordResponseSchema,
  revokeSessionResponseSchema,
  sessionListResponseSchema,
  supportElevationResponseSchema,
  switchMembershipResponseSchema,
} from '@gdm/contracts';

import type {
  AuthSession,
  AuthUser,
  LoginInput,
  MembershipSummary,
  OrganizationOption,
  PasswordResetInput,
  RoleCode,
  SessionDevice,
  StartSupportElevationInput,
  SupportElevation,
} from './auth-types';

interface ApiErrorBody {
  error?: {
    code?: unknown;
    correlation_id?: unknown;
    details?: unknown;
    message?: unknown;
    retryable?: unknown;
  };
}

interface RequestOptions {
  allowRefresh?: boolean;
  authenticated?: boolean;
}

type JsonRecord = Record<string, unknown>;

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'REQUEST_FAILED',
    readonly correlationId?: string,
    readonly details?: unknown,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class AuthApiClient {
  private accessToken: string | null = null;
  private expiredNotified = false;
  private refreshPromise: Promise<boolean> | null = null;
  private sessionExpiredHandler: ((reason: ApiClientError) => void) | null = null;

  setSessionExpiredHandler(handler: ((reason: ApiClientError) => void) | null): void {
    this.sessionExpiredHandler = handler;
  }

  clearAccessToken(): void {
    this.accessToken = null;
  }

  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
    this.expiredNotified = false;
  }

  async request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
    const authenticated = options.authenticated ?? true;
    const response = await this.fetch(path, init, authenticated);

    if (response.status === 401 && authenticated) {
      const reason = await this.errorFromResponse(response.clone());
      const canRefresh = reason.code === 'SESSION_EXPIRED' && (options.allowRefresh ?? true);

      if (canRefresh && (await this.refreshAccessToken())) {
        const retriedResponse = await this.fetch(path, init, true);
        if (retriedResponse.status === 401) {
          this.notifySessionExpired(await this.errorFromResponse(retriedResponse.clone()));
        }
        return this.parseResponse<T>(retriedResponse);
      }

      this.notifySessionExpired(reason);
    }

    return this.parseResponse<T>(response);
  }

  async restoreSession(): Promise<boolean> {
    return this.refreshAccessToken();
  }

  async login(input: LoginInput): Promise<AuthSession> {
    const response = loginResponseSchema.parse(
      await this.request<unknown>(
        '/auth/login',
        {
          body: JSON.stringify({
            client_type: 'web',
            device: {
              device_name: input.deviceName ?? browserDeviceName(),
              platform: 'web',
            },
            email: input.email.trim().toLowerCase(),
            password: input.password,
          }),
          method: 'POST',
        },
        { allowRefresh: false, authenticated: false },
      ),
    );

    this.consumeAccessToken(response);
    return this.me();
  }

  async me(): Promise<AuthSession> {
    const session = normalizeAuthSession(
      meResponseSchema.parse(await this.request<unknown>('/me')),
    );

    if (session.permissions.includes('platform.support_elevation.manage')) {
      const response = clientOrganizationListResponseSchema.parse(
        await this.request<unknown>('/clients'),
      );
      session.supportTargets = response.client_organizations
        .filter((client) => client.status === 'ACTIVE')
        .map((client) => ({ id: client.id, name: client.display_name }));
    }

    return session;
  }

  async logout(): Promise<void> {
    try {
      logoutResponseSchema.parse(
        await this.request<unknown>(
          '/auth/logout',
          { body: JSON.stringify({}), method: 'POST' },
          { allowRefresh: false },
        ),
      );
    } finally {
      this.clearAccessToken();
    }
  }

  async logoutAll(): Promise<void> {
    try {
      logoutAllResponseSchema.parse(
        await this.request<unknown>(
          '/auth/logout-all',
          { body: JSON.stringify({}), method: 'POST' },
          { allowRefresh: true },
        ),
      );
    } finally {
      this.clearAccessToken();
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    forgotPasswordResponseSchema.parse(
      await this.request<unknown>(
        '/auth/forgot-password',
        {
          body: JSON.stringify({ email: email.trim().toLowerCase() }),
          method: 'POST',
        },
        { allowRefresh: false, authenticated: false },
      ),
    );
  }

  async resetPassword(input: PasswordResetInput): Promise<void> {
    resetPasswordResponseSchema.parse(
      await this.request<unknown>(
        '/auth/reset-password',
        {
          body: JSON.stringify({ new_password: input.password, token: input.token }),
          method: 'POST',
        },
        { allowRefresh: false, authenticated: false },
      ),
    );
  }

  async listSessions(): Promise<SessionDevice[]> {
    const response = sessionListResponseSchema.parse(await this.request<unknown>('/auth/sessions'));
    return response.sessions.map(normalizeSessionDevice);
  }

  async revokeSession(sessionId: string): Promise<void> {
    revokeSessionResponseSchema.parse(
      await this.request<unknown>(`/auth/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      }),
    );
  }

  async switchMembership(membershipId: string): Promise<AuthSession> {
    const response = switchMembershipResponseSchema.parse(
      await this.request<unknown>('/auth/switch-membership', {
        body: JSON.stringify({ membership_id: membershipId }),
        method: 'POST',
      }),
    );
    this.consumeAccessToken(response);
    return this.me();
  }

  async startSupportElevation(input: StartSupportElevationInput): Promise<AuthSession> {
    const request = createSupportElevationRequestSchema.parse({
      client_organization_id: input.clientOrganizationId,
      reason: input.reason.trim(),
    });
    supportElevationResponseSchema.parse(
      await this.request<unknown>('/support-elevation', {
        body: JSON.stringify(request),
        method: 'POST',
      }),
    );
    return this.me();
  }

  async endSupportElevation(): Promise<AuthSession> {
    supportElevationResponseSchema.parse(
      await this.request<unknown>('/support-elevation', {
        body: JSON.stringify({}),
        method: 'DELETE',
      }),
    );
    return this.me();
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (this.refreshPromise !== null) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await this.fetch(
          '/auth/refresh',
          { body: JSON.stringify({}), method: 'POST' },
          false,
        );

        if (!response.ok) {
          return false;
        }

        const parsed = refreshResponseSchema.safeParse(await parseJson(response));

        if (!parsed.success) {
          return false;
        }

        this.setAccessToken(parsed.data.access_token);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private notifySessionExpired(reason: ApiClientError): void {
    if (this.expiredNotified) {
      return;
    }

    this.expiredNotified = true;
    this.clearAccessToken();
    this.sessionExpiredHandler?.(reason);
  }

  private consumeAccessToken(body: unknown): void {
    const token = findAccessToken(body);
    if (token === undefined) {
      throw new ApiClientError(
        'The server returned an invalid session response.',
        502,
        'INVALID_RESPONSE',
      );
    }
    this.setAccessToken(token);
  }

  private async fetch(path: string, init: RequestInit, authenticated: boolean): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');

    if (init.body !== undefined && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (authenticated && this.accessToken !== null) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }

    try {
      return await fetch(`${publicEnvironment.apiBaseUrl}${path}`, {
        ...init,
        cache: 'no-store',
        credentials: 'include',
        headers,
      });
    } catch {
      throw new ApiClientError(
        'The service could not be reached. Check your connection and try again.',
        0,
        'NETWORK_ERROR',
        undefined,
        undefined,
        true,
      );
    }
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const body = await parseJson(response);

    if (!response.ok) {
      throw apiErrorFromBody(body, response.status);
    }

    return body as T;
  }

  private async errorFromResponse(response: Response): Promise<ApiClientError> {
    return apiErrorFromBody(await parseJson(response), response.status);
  }
}

async function parseJson(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return undefined;
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  }
}

function findAccessToken(value: unknown): string | undefined {
  const root = asRecord(value);
  const session = asRecord(root.session);
  return (
    readString(root, 'access_token', 'accessToken') ??
    readString(session, 'access_token', 'accessToken')
  );
}

function normalizeAuthSession(value: unknown): AuthSession {
  const root = asRecord(value);
  const userRecord = asRecord(root.user ?? root);
  const user: AuthUser = {
    displayName:
      readString(userRecord, 'display_name', 'displayName', 'name') ??
      readString(userRecord, 'email') ??
      'CRM user',
    email: readString(userRecord, 'email') ?? '',
    id: requiredString(userRecord, 'id', 'user_id', 'userId'),
    status: ['SUSPENDED', 'DEACTIVATED', 'suspended', 'deactivated'].includes(
      readString(userRecord, 'status') ?? '',
    )
      ? 'suspended'
      : 'active',
  };

  const membershipValues = asArray(root.memberships ?? root.available_memberships);
  const memberships = membershipValues.map(normalizeMembership);
  const currentMembershipRecord =
    root.active_membership ??
    root.activeMembership ??
    root.current_membership ??
    root.currentMembership ??
    root.membership;
  let currentMembership =
    currentMembershipRecord === null || currentMembershipRecord === undefined
      ? null
      : normalizeMembership(currentMembershipRecord);

  const currentMembershipId = readString(root, 'current_membership_id', 'currentMembershipId');
  currentMembership ??=
    memberships.find((membership) => membership.id === currentMembershipId) ?? null;

  const permissions = uniqueStrings(
    asArray(root.permissions ?? currentMembership?.permissions).filter(
      (permission): permission is string => typeof permission === 'string',
    ),
  );

  const supportRecord = root.support_elevation ?? root.supportElevation;
  const supportElevation =
    supportRecord === null || supportRecord === undefined
      ? null
      : normalizeSupportElevation(supportRecord);

  return {
    currentMembership,
    memberships,
    permissions,
    supportElevation,
    supportTargets: [],
    user,
  };
}

function normalizeMembership(value: unknown): MembershipSummary {
  const record = asRecord(value);
  const role = asRecord(record.role);
  const clientOrganization = asRecord(record.client_organization ?? record.clientOrganization);
  const agency = asRecord(record.agency);
  const organization = normalizeOrganization(
    Object.keys(clientOrganization).length > 0
      ? clientOrganization
      : Object.keys(agency).length > 0
        ? agency
        : {
            id: record.client_organization_id ?? record.clientOrganizationId,
            name: record.client_organization_name ?? record.clientOrganizationName,
          },
  );
  const roleCode =
    readString(record, 'role_code', 'roleCode') ?? readString(role, 'code') ?? 'MEMBER';

  return {
    branchNames: readNames(
      record.branch_ids ??
        record.branchIds ??
        record.branch_scopes ??
        record.branchScopes ??
        record.branches,
    ),
    clientOrganization: organization,
    id: requiredString(record, 'id', 'membership_id', 'membershipId'),
    permissions: uniqueStrings(
      asArray(record.permissions).filter(
        (permission): permission is string => typeof permission === 'string',
      ),
    ),
    roleCode: roleCode as RoleCode | string,
    roleName:
      readString(record, 'role_name', 'roleName') ??
      readString(role, 'name') ??
      humanizeCode(roleCode),
    status: ['SUSPENDED', 'suspended'].includes(readString(record, 'status') ?? '')
      ? 'suspended'
      : ['ENDED', 'INVITED', 'inactive', 'ended', 'invited'].includes(
            readString(record, 'status') ?? '',
          )
        ? 'inactive'
        : 'active',
    teamNames: readNames(
      record.team_ids ?? record.teamIds ?? record.team_scopes ?? record.teamScopes ?? record.teams,
    ),
  };
}

function normalizeOrganization(value: unknown): OrganizationOption {
  const record = asRecord(value);
  return {
    id: requiredString(record, 'id', 'client_organization_id', 'clientOrganizationId'),
    name:
      readString(record, 'name', 'display_name', 'displayName', 'legal_name', 'legalName') ??
      'Client organization',
  };
}

function normalizeSupportElevation(value: unknown): SupportElevation {
  const record = asRecord(value);
  return {
    clientOrganization: normalizeOrganization(
      record.client_organization ??
        record.clientOrganization ?? {
          id: record.client_organization_id ?? record.clientOrganizationId,
          name: record.client_organization_name ?? record.clientOrganizationName,
        },
    ),
    expiresAt: requiredString(record, 'expires_at', 'expiresAt'),
    id: requiredString(record, 'id'),
    reason: requiredString(record, 'reason'),
  };
}

function normalizeSessionDevice(value: unknown): SessionDevice {
  const record = asRecord(value);
  const result: SessionDevice = {
    createdAt: requiredString(record, 'created_at', 'createdAt'),
    current: record.current === true || record.is_current === true || record.isCurrent === true,
    deviceName:
      readString(record, 'device_name', 'deviceName') ??
      humanizeCode(readString(record, 'device_platform', 'devicePlatform') ?? 'unknown device'),
    expiresAt: requiredString(record, 'expires_at', 'expiresAt'),
    id: requiredString(record, 'id', 'session_id', 'sessionId'),
    lastSeenAt: requiredString(record, 'last_seen_at', 'lastSeenAt', 'updated_at', 'updatedAt'),
  };
  const ipAddress = readString(record, 'ip_address', 'ipAddress');
  const revokedAt = readString(record, 'revoked_at', 'revokedAt');
  const userAgent = readString(record, 'user_agent', 'userAgent');
  if (ipAddress !== undefined) result.ipAddress = ipAddress;
  if (revokedAt !== undefined) result.revokedAt = revokedAt;
  if (userAgent !== undefined) result.userAgent = userAgent;
  return result;
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(record: JsonRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return undefined;
}

function requiredString(record: JsonRecord, ...keys: string[]): string {
  const value = readString(record, ...keys);
  if (value === undefined) {
    throw new ApiClientError('The server returned an invalid response.', 502, 'INVALID_RESPONSE');
  }
  return value;
}

function readNames(value: unknown): string[] {
  return asArray(value)
    .map((entry) => (typeof entry === 'string' ? entry : readString(asRecord(entry), 'name')))
    .filter((entry): entry is string => entry !== undefined);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function humanizeCode(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export const authApiClient = new AuthApiClient();

function apiErrorFromBody(body: unknown, status: number): ApiClientError {
  const apiError = asRecord(body) as ApiErrorBody;
  const error = apiError.error;
  const message =
    typeof error?.message === 'string' && status < 500
      ? error.message
      : status >= 500
        ? 'The service encountered an unexpected error. Try again later.'
        : 'The request could not be completed.';

  return new ApiClientError(
    message,
    status,
    typeof error?.code === 'string' ? error.code : `HTTP_${status}`,
    typeof error?.correlation_id === 'string' ? error.correlation_id : undefined,
    error?.details,
    error?.retryable === true,
  );
}

function browserDeviceName(): string {
  if (typeof navigator === 'undefined') {
    return 'Web browser';
  }

  const platform = navigator.platform.trim();
  return platform.length > 0 ? `${platform} browser` : 'Web browser';
}
