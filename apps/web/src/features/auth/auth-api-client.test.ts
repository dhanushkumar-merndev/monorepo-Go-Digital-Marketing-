import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, AuthApiClient } from './auth-api-client';

const accessToken = 'a'.repeat(48);
const userId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
const agencyId = '44444444-4444-4444-8444-444444444444';
const roleId = '55555555-5555-4555-8555-555555555555';
const sessionId = '66666666-6666-4666-8666-666666666666';
const googleLoginNonce = 'a'.repeat(64);
const googleLinkNonce = 'b'.repeat(64);
const now = '2026-08-02T12:00:00.000Z';
const later = '2026-08-02T13:00:00.000Z';

const membership = {
  active_membership: undefined,
  agency: null,
  assignment_scope: 'ALL',
  branch_ids: [],
  branch_scope_mode: 'ALL',
  department_ids: [],
  department_scope_mode: 'ALL',
  job_title: 'CRM Admin',
  client_organization: {
    agency_id: agencyId,
    display_name: 'Northstar Motors',
    id: clientId,
    legal_name: 'Northstar Motors Private Limited',
    status: 'ACTIVE',
    timezone: 'Asia/Kolkata',
  },
  context_type: 'CLIENT',
  effective_from: now,
  effective_until: null,
  id: membershipId,
  role: {
    application: 'WEB',
    code: 'CLIENT_ADMIN',
    display_name: 'Client Admin',
    id: roleId,
  },
  status: 'ACTIVE',
  team_ids: [],
  team_scope_mode: 'ALL',
} as const;

function refreshPayload() {
  return {
    access_token: accessToken,
    access_token_expires_at: later,
    active_membership: membership,
    memberships: [membership],
    permissions: ['account.profile.read', 'account.sessions.read'],
    refresh_token_expires_at: '2026-08-09T12:00:00.000Z',
    session: {
      client_type: 'web',
      created_at: now,
      current: true,
      device_id: null,
      device_name: 'Windows browser',
      device_platform: 'web',
      expires_at: '2026-08-09T12:00:00.000Z',
      id: sessionId,
      last_seen_at: now,
      revoked_at: null,
    },
    support_elevation: null,
    user: { display_name: 'Asha Rao', email: 'asha@example.com', id: userId, status: 'ACTIVE' },
  };
}

function googleLoginPayload() {
  return {
    ...refreshPayload(),
    requires_membership_selection: false,
    status: 'AUTHENTICATED',
  } as const;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

function authError(code: string, status = 401): Response {
  return jsonResponse(
    {
      error: {
        code,
        correlation_id: 'req-1',
        details: [],
        message: 'Server detail',
        retryable: false,
      },
    },
    status,
  );
}

describe('AuthApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an Agency Admin MFA challenge without treating it as an authenticated session', async () => {
    const challengeToken = `77777777-7777-4777-8777-777777777777.${'a'.repeat(43)}`;
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        challenge_expires_at: later,
        challenge_token: challengeToken,
        methods: ['TOTP', 'RECOVERY_CODE'],
        status: 'MFA_REQUIRED',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new AuthApiClient().login({ email: 'agency@example.com', password: 'correct horse' }),
    ).resolves.toEqual({
      challengeExpiresAt: later,
      challengeToken,
      methods: ['TOTP', 'RECOVERY_CODE'],
      status: 'MFA_REQUIRED',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses the HttpOnly cookie transport and retries once after SESSION_EXPIRED', async () => {
    const calls: {
      authorization: string | null;
      credentials: RequestCredentials | undefined;
      url: string;
    }[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        authorization: headers.get('Authorization'),
        credentials: init?.credentials,
        url,
      });

      if (url.endsWith('/auth/refresh')) return jsonResponse(refreshPayload());
      if (headers.get('Authorization') === `Bearer ${accessToken}`)
        return jsonResponse({ ok: true });
      return authError('SESSION_EXPIRED');
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new AuthApiClient();
    client.setAccessToken('expired-access-token');

    await expect(client.request<{ ok: boolean }>('/protected')).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.credentials === 'include')).toBe(true);
    expect(calls[0]?.authorization).toBe('Bearer expired-access-token');
    expect(calls[1]?.url).toMatch(/\/auth\/refresh$/);
    expect(calls[1]?.authorization).toBeNull();
    expect(calls[2]?.authorization).toBe(`Bearer ${accessToken}`);
  });

  it('coalesces concurrent refresh attempts into one rotation request', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const authorization = new Headers(init?.headers).get('Authorization');
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        await Promise.resolve();
        return jsonResponse(refreshPayload());
      }
      return authorization === `Bearer ${accessToken}`
        ? jsonResponse({ ok: true })
        : authError('SESSION_EXPIRED');
    });
    vi.stubGlobal('fetch', fetchMock);
    const client = new AuthApiClient();
    client.setAccessToken('expired-access-token');

    await expect(Promise.all([client.request('/one'), client.request('/two')])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(refreshCalls).toBe(1);
  });

  it('does not refresh a revoked session and reports expiry once', async () => {
    const fetchMock = vi.fn(async () => authError('SESSION_REVOKED'));
    vi.stubGlobal('fetch', fetchMock);
    const onExpired = vi.fn();
    const client = new AuthApiClient();
    client.setAccessToken(accessToken);
    client.setSessionExpiredHandler(onExpired);

    await expect(client.request('/protected')).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_REVOKED' }));
  });

  it('signals an expired support context on a protected 403 before rejecting the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => authError('SUPPORT_ELEVATION_REQUIRED', 403)),
    );
    const onSupportExpired = vi.fn();
    const client = new AuthApiClient();
    client.setAccessToken(accessToken);
    client.setSupportElevationExpiredHandler(onSupportExpired);

    await expect(client.request('/protected-client-resource')).rejects.toMatchObject({
      code: 'SUPPORT_ELEVATION_REQUIRED',
      status: 403,
    });
    expect(onSupportExpired).toHaveBeenCalledOnce();
    expect(onSupportExpired).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SUPPORT_ELEVATION_REQUIRED' }),
    );
  });

  it('does not expose a server-provided 5xx message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          { error: { code: 'INTERNAL_ERROR', message: 'database password leaked here' } },
          500,
        ),
      ),
    );
    const client = new AuthApiClient();
    client.setAccessToken(accessToken);

    const error = await client.request('/protected').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).message).not.toContain('database password');
    expect((error as ApiClientError).message).toContain('unexpected error');
  });

  it('creates a nonce-bound Google web session through the existing HttpOnly cookie transport', async () => {
    const challengeId = '77777777-7777-4777-8777-777777777777';
    const idToken = 'google-signed-id-token-with-at-least-32-characters';
    const calls: {
      body: unknown;
      credentials: RequestCredentials | undefined;
      url: string;
    }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
          credentials: init?.credentials,
          url,
        });
        if (url.endsWith('/auth/google/challenge')) {
          return jsonResponse({
            challenge_id: challengeId,
            expires_at: '2026-08-03T13:00:00.000Z',
            nonce: googleLoginNonce,
          });
        }
        if (url.endsWith('/auth/google/login')) return jsonResponse(googleLoginPayload());
        if (url.endsWith('/me')) return jsonResponse(refreshPayload());
        return authError('UNEXPECTED_ROUTE', 404);
      }),
    );
    const client = new AuthApiClient();

    await expect(client.createGoogleLoginChallenge()).resolves.toEqual({
      challengeId,
      expiresAt: '2026-08-03T13:00:00.000Z',
      nonce: googleLoginNonce,
    });
    await expect(client.loginWithGoogle({ challengeId, idToken })).resolves.toMatchObject({
      user: { email: 'asha@example.com' },
    });

    expect(calls.every((call) => call.credentials === 'include')).toBe(true);
    expect(calls[0]?.body).toEqual({ client_type: 'web' });
    expect(calls[1]?.body).toMatchObject({
      challenge_id: challengeId,
      client_type: 'web',
      device: { platform: 'web' },
      id_token: idToken,
    });
    expect(calls[1]?.body).not.toHaveProperty('email');
    expect(calls[1]?.body).not.toHaveProperty('refresh_token');
  });

  it('lists, links, and unlinks only the authenticated user Google identity', async () => {
    const challengeId = '77777777-7777-4777-8777-777777777777';
    const idToken = 'google-signed-id-token-with-at-least-32-characters';
    const calls: {
      authorization: string | null;
      body: unknown;
      method: string | undefined;
      url: string;
    }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({
          authorization: new Headers(init?.headers).get('Authorization'),
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
          method: init?.method,
          url,
        });
        if (url.endsWith('/auth/google/link-challenge')) {
          return jsonResponse({
            challenge_id: challengeId,
            expires_at: '2026-08-03T13:00:00.000Z',
            nonce: googleLinkNonce,
          });
        }
        if (url.endsWith('/auth/google/link')) {
          return jsonResponse({
            linked: true,
            method: {
              can_unlink: true,
              connected: true,
              email: 'asha@gmail.com',
              last_used_at: null,
              linked_at: now,
              provider: 'GOOGLE',
              unlink_block_reason: null,
            },
          });
        }
        if (url.endsWith('/auth/methods')) {
          return jsonResponse({
            methods: [
              {
                can_unlink: false,
                connected: true,
                email: 'asha@example.com',
                last_used_at: now,
                linked_at: now,
                provider: 'PASSWORD',
                unlink_block_reason: 'LAST_LOGIN_METHOD',
              },
              {
                can_unlink: true,
                connected: true,
                email: 'asha@gmail.com',
                last_used_at: null,
                linked_at: now,
                provider: 'GOOGLE',
                unlink_block_reason: null,
              },
            ],
          });
        }
        if (url.endsWith('/auth/google') && init?.method === 'DELETE') {
          return jsonResponse({ current_session_revoked: false, unlinked: true });
        }
        return authError('UNEXPECTED_ROUTE', 404);
      }),
    );
    const client = new AuthApiClient();
    client.setAccessToken(accessToken);

    await client.createGoogleLinkChallenge();
    await client.linkGoogleIdentity({ challengeId, idToken });
    await expect(client.listAuthenticationMethods()).resolves.toEqual([
      {
        canUnlink: false,
        connected: true,
        email: 'asha@example.com',
        lastUsedAt: now,
        linkedAt: now,
        provider: 'PASSWORD',
        unlinkBlockReason: 'LAST_LOGIN_METHOD',
      },
      {
        canUnlink: true,
        connected: true,
        email: 'asha@gmail.com',
        linkedAt: now,
        provider: 'GOOGLE',
      },
    ]);
    await expect(client.unlinkGoogleIdentity()).resolves.toEqual({
      currentSessionRevoked: false,
      unlinked: true,
    });

    expect(calls.every((call) => call.authorization === `Bearer ${accessToken}`)).toBe(true);
    expect(calls[1]?.body).toEqual({ challenge_id: challengeId, id_token: idToken });
    expect(calls.at(-1)).toMatchObject({ method: 'DELETE' });
  });
});
