import type { AuthTransport } from '../api/auth-transport';
import type { CredentialVault } from '../auth/credential-vault';
import type { MobileSession } from '../auth/auth-types';
import type { CanonicalRoleCode } from '@gdm/contracts';

export function sessionFixture(
  overrides: {
    accessToken?: string;
    accessTokenExpiresAt?: string;
    refreshToken?: string;
    roleCode?: CanonicalRoleCode;
  } = {},
): MobileSession {
  return {
    credentials: {
      accessToken: overrides.accessToken ?? 'access-token-one',
      accessTokenExpiresAt:
        overrides.accessTokenExpiresAt ?? new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      refreshToken: overrides.refreshToken ?? 'refresh-token-one',
      refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
      sessionId: 'session-1',
    },
    principal: {
      branchIds: ['branch-1'],
      clientOrganizationId: 'client-1',
      clientOrganizationName: 'Northside Motors',
      displayName: 'Asha Singh',
      email: 'asha@example.com',
      membershipId: 'membership-1',
      permissions: ['mobile.workspace.read'],
      roleCode: overrides.roleCode ?? 'SALESPERSON',
      teamIds: ['team-1'],
      userId: 'user-1',
    },
  };
}

export function jsonResponse(status: number, payload: unknown): Response {
  const serialized = JSON.stringify(payload);
  const response = {
    clone: () => jsonResponse(status, payload),
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status,
    text: async () => serialized,
  };

  return response as unknown as Response;
}

export class MemoryCredentialVault implements CredentialVault {
  readonly clear = jest.fn(async () => {
    this.session = null;
  });

  readonly load = jest.fn(async () => this.session);

  readonly save = jest.fn(async (session: MobileSession) => {
    this.session = session;
  });

  constructor(public session: MobileSession | null = null) {}
}

export class FakeAuthTransport implements AuthTransport {
  readonly authorizedRequest = jest.fn<
    ReturnType<AuthTransport['authorizedRequest']>,
    Parameters<AuthTransport['authorizedRequest']>
  >(async () => jsonResponse(200, { ok: true }));

  readonly login = jest.fn<ReturnType<AuthTransport['login']>, Parameters<AuthTransport['login']>>(
    async () => sessionFixture(),
  );

  readonly logout = jest.fn<
    ReturnType<AuthTransport['logout']>,
    Parameters<AuthTransport['logout']>
  >(async () => undefined);

  readonly refresh = jest.fn<
    ReturnType<AuthTransport['refresh']>,
    Parameters<AuthTransport['refresh']>
  >(async () => sessionFixture({ accessToken: 'access-token-two', refreshToken: 'refresh-two' }));
}
