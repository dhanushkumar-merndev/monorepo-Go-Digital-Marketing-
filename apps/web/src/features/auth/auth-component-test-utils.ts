import type { AuthContextValue } from './auth-provider';
import type { AuthSession, MembershipSummary, RoleCode } from './auth-types';

export function testMembership(
  roleCode: RoleCode = 'SALESPERSON',
  overrides: Partial<MembershipSummary> = {},
): MembershipSummary {
  return {
    branchNames: ['Bengaluru Central'],
    clientOrganization: { id: '33333333-3333-4333-8333-333333333333', name: 'Northstar Motors' },
    id: '22222222-2222-4222-8222-222222222222',
    permissions: [],
    roleCode,
    roleName: roleCode
      .toLowerCase()
      .split('_')
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(' '),
    status: 'active',
    teamNames: ['Retail Sales'],
    ...overrides,
  };
}

export function testAuthSession(
  roleCode: RoleCode = 'SALESPERSON',
  permissions: string[] = ['account.profile.read', 'account.sessions.read'],
): AuthSession {
  const membership = testMembership(roleCode, { permissions });
  return {
    currentMembership: membership,
    memberships: [membership],
    permissions,
    supportElevation: null,
    supportTargets: [],
    user: {
      displayName: 'Asha Rao',
      email: 'asha@example.com',
      id: '11111111-1111-4111-8111-111111111111',
      status: 'active',
    },
  };
}

export function testAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const unimplemented = async () => undefined;
  return {
    api: null as never,
    createGoogleLinkChallenge: async () => ({
      challengeId: 'google-link-challenge',
      expiresAt: '2026-08-03T13:00:00.000Z',
      nonce: 'google-link-nonce',
    }),
    createGoogleLoginChallenge: async () => ({
      challengeId: 'google-login-challenge',
      expiresAt: '2026-08-03T13:00:00.000Z',
      nonce: 'google-login-nonce',
    }),
    endSupportElevation: unimplemented,
    error: null,
    linkGoogleIdentity: unimplemented,
    listAuthenticationMethods: async () => [],
    listSessions: async () => [],
    login: unimplemented,
    loginWithGoogle: unimplemented,
    logout: unimplemented,
    logoutAll: unimplemented,
    refreshProfile: unimplemented,
    requestPasswordReset: unimplemented,
    resetPassword: unimplemented,
    retryInitialization: unimplemented,
    revokeSession: unimplemented,
    session: testAuthSession(),
    startSupportElevation: unimplemented,
    status: 'authenticated',
    switchMembership: unimplemented,
    unlinkGoogleIdentity: async () => ({ currentSessionRevoked: false, unlinked: true }),
    ...overrides,
  };
}
