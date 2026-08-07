import { HttpAuthTransport } from '../api/auth-transport';
import { sessionFixture, jsonResponse } from './auth-test-fixtures';

const authResponse = {
  access_token: 'access-token-two-0000000000000000',
  access_token_expires_at: '2030-01-01T00:00:00.000Z',
  active_membership: {
    agency: null,
    assignment_scope: 'ASSIGNED',
    branch_ids: ['10000000-0000-4000-8000-000000000001'],
    branch_scope_mode: 'SELECTED',
    department_ids: ['10000000-0000-4000-8000-000000000009'],
    department_scope_mode: 'SELECTED',
    client_organization: {
      agency_id: '10000000-0000-4000-8000-000000000002',
      display_name: 'Northside Motors',
      id: '10000000-0000-4000-8000-000000000003',
      legal_name: 'Northside Motors Private Limited',
      status: 'ACTIVE',
      timezone: 'Asia/Kolkata',
    },
    context_type: 'CLIENT',
    effective_from: '2029-01-01T00:00:00.000Z',
    effective_until: null,
    id: '10000000-0000-4000-8000-000000000004',
    job_title: 'Sales Consultant',
    role: {
      application: 'MOBILE',
      code: 'SALESPERSON',
      display_name: 'Salesperson',
      id: '10000000-0000-4000-8000-000000000005',
    },
    status: 'ACTIVE',
    team_ids: ['10000000-0000-4000-8000-000000000006'],
    team_scope_mode: 'SELECTED',
  },
  memberships: [],
  permissions: ['account.profile.read'],
  refresh_token: 'refresh-token-two-000000000000000',
  refresh_token_expires_at: '2030-02-01T00:00:00.000Z',
  requires_membership_selection: false,
  session: {
    client_type: 'mobile',
    created_at: '2029-01-01T00:00:00.000Z',
    current: true,
    device_id: null,
    device_name: 'Android app',
    device_platform: 'android',
    expires_at: '2030-02-01T00:00:00.000Z',
    id: '10000000-0000-4000-8000-000000000007',
    last_seen_at: '2029-01-01T00:00:00.000Z',
    revoked_at: null,
  },
  support_elevation: null,
  status: 'AUTHENTICATED',
  user: {
    display_name: 'Asha Singh',
    email: 'asha@example.com',
    id: '10000000-0000-4000-8000-000000000008',
    status: 'ACTIVE',
  },
};

describe('HttpAuthTransport', () => {
  it('obtains a one-time challenge and exchanges only the Google ID token for a CRM session', async () => {
    const request = jest
      .fn<Promise<Response>, [string, RequestInit?]>()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          challenge_id: '10000000-0000-4000-8000-000000000099',
          expires_at: '2030-01-01T00:05:00.000Z',
          nonce: 'a'.repeat(64),
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, authResponse));
    const transport = new HttpAuthTransport('https://api.example.com/v1', request);

    await expect(transport.createGoogleChallenge()).resolves.toEqual({
      challengeId: '10000000-0000-4000-8000-000000000099',
      expiresAt: '2030-01-01T00:05:00.000Z',
      nonce: 'a'.repeat(64),
    });
    await transport.googleLogin(
      {
        challengeId: '10000000-0000-4000-8000-000000000099',
        idToken: 'verified-by-backend-only',
      },
      { deviceName: 'iPhone app', platform: 'ios' },
    );

    expect(request.mock.calls[0]?.[0]).toBe('https://api.example.com/v1/auth/google/challenge');
    expect(request.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: JSON.stringify({ client_type: 'mobile' }),
        method: 'POST',
      }),
    );
    expect(request.mock.calls[1]?.[0]).toBe('https://api.example.com/v1/auth/google/login');
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
      challenge_id: '10000000-0000-4000-8000-000000000099',
      client_type: 'mobile',
      device: { device_name: 'iPhone app', platform: 'ios' },
      id_token: 'verified-by-backend-only',
    });
    expect(String(request.mock.calls[1]?.[1]?.body)).not.toMatch(
      /"(?:client_organization|display_name|email|name|provider_subject|tenant)"\s*:/iu,
    );
  });

  it('rejects malformed Google challenges before opening the provider flow', async () => {
    const request = jest.fn<Promise<Response>, [string, RequestInit?]>(async () =>
      jsonResponse(200, {
        challenge_id: '10000000-0000-4000-8000-000000000099',
        expires_at: 'not-a-date',
        nonce: 'unsafe',
      }),
    );
    const transport = new HttpAuthTransport('https://api.example.com/v1', request);

    await expect(transport.createGoogleChallenge()).rejects.toMatchObject({
      name: 'InvalidApiResponseError',
    });
  });

  it('uses the mobile login contract without accepting a tenant identifier', async () => {
    const request = jest.fn<Promise<Response>, [string, RequestInit?]>(async () =>
      jsonResponse(200, authResponse),
    );
    const transport = new HttpAuthTransport('https://api.example.com/v1', request);

    await transport.login(
      { email: ' ASHA@example.com ', password: 'not-logged' },
      { deviceName: 'Android app', platform: 'android' },
    );

    const [url, init] = request.mock.calls[0] ?? [];
    expect(url).toBe('https://api.example.com/v1/auth/login');
    expect(JSON.parse(String(init?.body))).toEqual({
      client_type: 'mobile',
      device: { device_name: 'Android app', platform: 'android' },
      email: 'asha@example.com',
      password: 'not-logged',
    });
    expect(String(init?.body)).not.toMatch(/client_organization|tenant|membership/u);
  });

  it('adds the bearer token and rotates with only the refresh token', async () => {
    const request = jest
      .fn<Promise<Response>, [string, RequestInit?]>()
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, authResponse));
    const transport = new HttpAuthTransport('https://api.example.com/v1', request);
    const session = sessionFixture();

    await transport.authorizedRequest(session, '/me');
    await transport.refresh(session);

    const authorizedInit = request.mock.calls[0]?.[1];
    expect(authorizedInit?.headers).toMatchObject({
      authorization: 'Bearer access-token-one',
    });
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
      refresh_token: 'refresh-token-one',
    });
  });

  it('revokes the current session without adding client-supplied tenant context', async () => {
    const request = jest.fn<Promise<Response>, [string, RequestInit?]>(async () =>
      jsonResponse(200, { logged_out: true }),
    );
    const transport = new HttpAuthTransport('https://api.example.com/v1', request);

    await transport.logout(sessionFixture());

    expect(request.mock.calls[0]?.[0]).toBe('https://api.example.com/v1/auth/logout');
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
      authorization: 'Bearer access-token-one',
    });
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
      refresh_token: 'refresh-token-one',
    });
  });
});
