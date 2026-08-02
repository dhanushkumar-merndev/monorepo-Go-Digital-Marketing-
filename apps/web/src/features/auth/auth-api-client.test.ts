import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError, AuthApiClient } from './auth-api-client';

const accessToken = 'a'.repeat(48);
const userId = '11111111-1111-4111-8111-111111111111';
const membershipId = '22222222-2222-4222-8222-222222222222';
const clientId = '33333333-3333-4333-8333-333333333333';
const agencyId = '44444444-4444-4444-8444-444444444444';
const roleId = '55555555-5555-4555-8555-555555555555';
const sessionId = '66666666-6666-4666-8666-666666666666';
const now = '2026-08-02T12:00:00.000Z';
const later = '2026-08-02T13:00:00.000Z';

const membership = {
  active_membership: undefined,
  agency: null,
  assignment_scope: 'ALL',
  branch_ids: [],
  branch_scope_mode: 'ALL',
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
});
