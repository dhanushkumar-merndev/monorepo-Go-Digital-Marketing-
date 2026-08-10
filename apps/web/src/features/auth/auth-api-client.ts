import { publicEnvironment } from '@/lib/env';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import {
  authenticationMethodsResponseSchema,
  createSupportElevationRequestSchema,
  clientOrganizationListResponseSchema,
  forgotPasswordResponseSchema,
  googleAuthChallengeRequestSchema,
  googleAuthChallengeResponseSchema,
  googleLinkRequestSchema,
  googleLinkResponseSchema,
  googleLoginRequestSchema,
  googleLoginResponseSchema,
  googleUnlinkResponseSchema,
  loginResponseSchema,
  mfaEnrollmentConfirmResponseSchema,
  mfaEnrollmentStartResponseSchema,
  mfaVerificationResponseSchema,
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
  AuthenticationMethod,
  AuthSession,
  AuthUser,
  GoogleAuthChallenge,
  GoogleCredentialInput,
  GoogleIdentityUnlinkResult,
  LoginInput,
  MfaEnrollmentSetup,
  MfaLoginChallenge,
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

function logTemporaryGoogleSignInDiagnostic(
  event: string,
  details: Record<string, boolean | string | null>,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  // TEMPORARY Google/Supabase sign-in diagnostic. Remove after the current
  // development sign-in investigation. Never include tokens, nonces, or user data.
  // eslint-disable-next-line no-console -- Intentionally temporary development-only diagnostic.
  console.info(`[Temporary Google sign-in diagnostic] ${event}`, details);
}

interface RequestOptions {
  allowRefresh?: boolean;
  authenticated?: boolean;
  notifySessionExpired?: boolean;
}

type JsonRecord = Record<string, unknown>;

function isEndedSessionError(error: ApiClientError): boolean {
  return error.code === 'SESSION_EXPIRED' || error.code === 'SESSION_REVOKED';
}

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
  private readonly supabase = getSupabaseBrowserClient();
  private expiredNotified = false;
  private refreshPromise: Promise<boolean> | null = null;
  private sessionExpiredHandler: ((reason: ApiClientError) => void) | null = null;
  private supportElevationExpiredHandler: ((reason: ApiClientError) => void) | null = null;

  setSessionExpiredHandler(handler: ((reason: ApiClientError) => void) | null): void {
    this.sessionExpiredHandler = handler;
  }

  setSupportElevationExpiredHandler(handler: ((reason: ApiClientError) => void) | null): void {
    this.supportElevationExpiredHandler = handler;
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
    const notifySessionExpired = options.notifySessionExpired ?? true;
    const response = await this.fetch(path, init, authenticated);

    if (response.status === 401 && authenticated) {
      const reason = await this.errorFromResponse(response.clone());

      if (reason.code === 'CRM_ACCOUNT_NOT_LINKED') {
        this.clearAccessToken();
        if (this.supabase) await this.supabase.auth.signOut();
        return this.parseResponse<T>(response);
      }

      const canRefresh = reason.code === 'SESSION_EXPIRED' && (options.allowRefresh ?? true);

      if (canRefresh && (await this.refreshAccessToken())) {
        const retriedResponse = await this.fetch(path, init, true);
        if (retriedResponse.status === 401) {
          const retriedReason = await this.errorFromResponse(retriedResponse.clone());
          if (notifySessionExpired && isEndedSessionError(retriedReason)) {
            this.notifySessionExpired(retriedReason);
          }
        }
        await this.notifySupportElevationExpired(retriedResponse);
        return this.parseResponse<T>(retriedResponse);
      }

      if (notifySessionExpired && isEndedSessionError(reason)) {
        this.notifySessionExpired(reason);
      }
    }

    if (authenticated) await this.notifySupportElevationExpired(response);

    return this.parseResponse<T>(response);
  }

  async restoreSession(): Promise<boolean> {
    if (this.supabase) {
      const { data } = await this.supabase.auth.getSession();
      if (!data.session) return false;
      this.setAccessToken(data.session.access_token);
      return true;
    }
    return this.refreshAccessToken();
  }

  async login(input: LoginInput): Promise<AuthSession | MfaLoginChallenge> {
    if (this.supabase) {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      });
      if (error || !data.session) {
        throw new ApiClientError('The email or password is incorrect.', 401, 'INVALID_CREDENTIALS');
      }
      this.setAccessToken(data.session.access_token);
      return this.me({ notifySessionExpired: false });
    }
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

    return this.consumeLoginResponse(response);
  }

  async createGoogleLoginChallenge(): Promise<GoogleAuthChallenge> {
    const request = googleAuthChallengeRequestSchema.parse({ client_type: 'web' });
    return normalizeGoogleChallenge(
      googleAuthChallengeResponseSchema.parse(
        await this.request<unknown>(
          '/auth/google/challenge',
          { body: JSON.stringify(request), method: 'POST' },
          { allowRefresh: false, authenticated: false },
        ),
      ),
    );
  }

  async loginWithGoogle(input: GoogleCredentialInput): Promise<AuthSession | MfaLoginChallenge> {
    if (this.supabase) {
      logTemporaryGoogleSignInDiagnostic('Google credential received', {
        has_challenge_id: input.challengeId.length > 0,
        has_nonce: Boolean(input.nonce),
      });
      const { data, error } = await this.supabase.auth.signInWithIdToken({
        ...(input.nonce ? { nonce: input.nonce } : {}),
        provider: 'google',
        token: input.idToken,
      });
      logTemporaryGoogleSignInDiagnostic('Supabase Google sign-in response', {
        error_code: error?.code ?? null,
        has_session: Boolean(data.session),
      });
      if (error || !data.session) {
        throw new ApiClientError(
          error?.message ?? 'Google did not return a usable sign-in session.',
          401,
          'GOOGLE_AUTH_FAILED',
        );
      }
      this.setAccessToken(data.session.access_token);
      return this.me({ notifySessionExpired: false });
    }
    const request = googleLoginRequestSchema.parse({
      challenge_id: input.challengeId,
      client_type: 'web',
      device: {
        device_name: browserDeviceName(),
        platform: 'web',
      },
      id_token: input.idToken,
    });
    const response = googleLoginResponseSchema.parse(
      await this.request<unknown>(
        '/auth/google/login',
        {
          body: JSON.stringify(request),
          method: 'POST',
        },
        { allowRefresh: false, authenticated: false },
      ),
    );

    return this.consumeLoginResponse(response);
  }

  async startMfaEnrollment(challengeToken: string): Promise<MfaEnrollmentSetup> {
    const response = mfaEnrollmentStartResponseSchema.parse(
      await this.request<unknown>(
        '/auth/mfa/enrollment/start',
        { body: JSON.stringify({ challenge_token: challengeToken }), method: 'POST' },
        { allowRefresh: false, authenticated: false },
      ),
    );
    return {
      authenticatorId: response.authenticator_id,
      challengeExpiresAt: response.challenge_expires_at,
      manualSecret: response.manual_secret,
      otpauthUri: response.otpauth_uri,
    };
  }

  async confirmMfaEnrollment(
    challengeToken: string,
    code: string,
  ): Promise<{ recoveryCodes: string[]; session: AuthSession }> {
    const response = mfaEnrollmentConfirmResponseSchema.parse(
      await this.request<unknown>(
        '/auth/mfa/enrollment/confirm',
        { body: JSON.stringify({ challenge_token: challengeToken, code }), method: 'POST' },
        { allowRefresh: false, authenticated: false },
      ),
    );
    this.consumeAccessToken(response);
    return {
      recoveryCodes: response.recovery_codes,
      session: await this.me({ notifySessionExpired: false }),
    };
  }

  async verifyMfa(
    challengeToken: string,
    method: 'RECOVERY_CODE' | 'TOTP',
    code: string,
  ): Promise<{ replacementRecoveryCode?: string; session: AuthSession }> {
    const response = mfaVerificationResponseSchema.parse(
      await this.request<unknown>(
        '/auth/mfa/verify',
        { body: JSON.stringify({ challenge_token: challengeToken, code, method }), method: 'POST' },
        { allowRefresh: false, authenticated: false },
      ),
    );
    this.consumeAccessToken(response);
    return {
      ...(response.replacement_recovery_code
        ? { replacementRecoveryCode: response.replacement_recovery_code }
        : {}),
      session: await this.me({ notifySessionExpired: false }),
    };
  }

  async createGoogleLinkChallenge(): Promise<GoogleAuthChallenge> {
    return normalizeGoogleChallenge(
      googleAuthChallengeResponseSchema.parse(
        await this.request<unknown>('/auth/google/link-challenge', {
          body: JSON.stringify({}),
          method: 'POST',
        }),
      ),
    );
  }

  async linkGoogleIdentity(input: GoogleCredentialInput): Promise<void> {
    const request = googleLinkRequestSchema.parse({
      challenge_id: input.challengeId,
      id_token: input.idToken,
    });
    googleLinkResponseSchema.parse(
      await this.request<unknown>('/auth/google/link', {
        body: JSON.stringify(request),
        method: 'POST',
      }),
    );
  }

  async listAuthenticationMethods(): Promise<AuthenticationMethod[]> {
    const response = authenticationMethodsResponseSchema.parse(
      await this.request<unknown>('/auth/methods'),
    );
    return response.methods.map(normalizeAuthenticationMethod);
  }

  async unlinkGoogleIdentity(): Promise<GoogleIdentityUnlinkResult> {
    const response = googleUnlinkResponseSchema.parse(
      await this.request<unknown>('/auth/google', { method: 'DELETE' }),
    );

    if (response.current_session_revoked) {
      this.clearAccessToken();
    }

    return {
      currentSessionRevoked: response.current_session_revoked,
      unlinked: response.unlinked,
    };
  }

  async me(options: Pick<RequestOptions, 'notifySessionExpired'> = {}): Promise<AuthSession> {
    const session = normalizeAuthSession(
      meResponseSchema.parse(await this.request<unknown>('/me', {}, options)),
    );

    if (session.permissions.includes('platform.support_elevation.manage')) {
      const response = clientOrganizationListResponseSchema.parse(
        await this.request<unknown>('/clients', {}, options),
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
      if (this.supabase) await this.supabase.auth.signOut();
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
      if (this.supabase) await this.supabase.auth.signOut({ scope: 'global' });
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
        if (this.supabase) {
          const { data } = await this.supabase.auth.getSession();
          if (!data.session) return false;
          const expiresSoon =
            data.session.expires_at === undefined ||
            data.session.expires_at * 1_000 - Date.now() < 30_000;
          const refreshed = expiresSoon
            ? await this.supabase.auth.refreshSession()
            : { data, error: null };
          if (refreshed.error || !refreshed.data.session) return false;
          this.setAccessToken(refreshed.data.session.access_token);
          return true;
        }
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

  private async notifySupportElevationExpired(response: Response): Promise<void> {
    if (response.status !== 403) return;

    const reason = await this.errorFromResponse(response.clone());
    if (reason.code === 'SUPPORT_ELEVATION_REQUIRED') {
      this.supportElevationExpiredHandler?.(reason);
    }
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

  private async consumeLoginResponse(
    response: ReturnType<typeof loginResponseSchema.parse>,
  ): Promise<AuthSession | MfaLoginChallenge> {
    if (response.status === 'AUTHENTICATED') {
      this.consumeAccessToken(response);
      return this.me({ notifySessionExpired: false });
    }
    return {
      challengeExpiresAt: response.challenge_expires_at,
      challengeToken: response.challenge_token,
      methods: response.status === 'MFA_REQUIRED' ? response.methods : ['TOTP'],
      status: response.status,
    };
  }

  private async fetch(path: string, init: RequestInit, authenticated: boolean): Promise<Response> {
    // Supabase persists its browser session independently of this in-memory client.
    // Re-read it before a protected request so a completed OAuth callback cannot race
    // with an earlier expired-session request and leave /me without a bearer token.
    if (authenticated && this.supabase) {
      const { data } = await this.supabase.auth.getSession();
      if (data.session && data.session.access_token !== this.accessToken) {
        this.setAccessToken(data.session.access_token);
      }
    }

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
    deviceName: readString(record, 'device_name', 'deviceName') ?? fallbackSessionName(record),
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

function fallbackSessionName(record: Record<string, unknown>): string {
  const platform = readString(record, 'device_platform', 'devicePlatform');
  if (platform && platform.toLowerCase() !== 'unknown') return humanizeCode(platform);
  return 'Previous web session';
}

function normalizeGoogleChallenge(value: unknown): GoogleAuthChallenge {
  const record = asRecord(value);
  return {
    challengeId: requiredString(record, 'challenge_id'),
    expiresAt: requiredString(record, 'expires_at'),
    nonce: requiredString(record, 'nonce'),
  };
}

function normalizeAuthenticationMethod(value: unknown): AuthenticationMethod {
  const record = asRecord(value);
  const provider = requiredString(record, 'provider');

  if (provider !== 'GOOGLE' && provider !== 'PASSWORD') {
    throw new ApiClientError('The server returned an invalid response.', 502, 'INVALID_RESPONSE');
  }

  const method: AuthenticationMethod = {
    canUnlink: record.can_unlink === true,
    connected: record.connected === true,
    provider,
  };
  const email = readString(record, 'email');
  const lastUsedAt = readString(record, 'last_used_at');
  const linkedAt = readString(record, 'linked_at');
  const unlinkBlockReason = readString(record, 'unlink_block_reason');

  if (email !== undefined) method.email = email;
  if (lastUsedAt !== undefined) method.lastUsedAt = lastUsedAt;
  if (linkedAt !== undefined) method.linkedAt = linkedAt;
  if (unlinkBlockReason !== undefined) method.unlinkBlockReason = unlinkBlockReason;
  return method;
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
