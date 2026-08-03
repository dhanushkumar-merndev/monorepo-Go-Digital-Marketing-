import type { AuthStore } from '../src/auth/auth-store.js';
import type { AuthRuntimeConfig } from '../src/auth/auth-runtime-config.js';

export const TEST_AUTH_CONFIG: AuthRuntimeConfig = {
  accessTokenAudience: 'gdm-test-clients',
  accessTokenIssuer: 'gdm-test-api',
  accessTokenSecret: 'test-access-token-secret-with-at-least-thirty-two-characters',
  accessTokenTtlSeconds: 300,
  cookieName: 'gdm_refresh',
  cookieSameSite: 'lax',
  cookieSecure: false,
  loginLockoutSeconds: 900,
  loginMaxAttempts: 5,
  googleChallengeTtlSeconds: 300,
  googleClientIds: ['123456789-test.apps.googleusercontent.com'],
  passwordPepper: 'test-password-pepper-with-at-least-thirty-two-characters',
  passwordResetTokenTtlSeconds: 1_800,
  refreshTokenPepper: 'test-refresh-token-pepper-with-at-least-thirty-two-characters',
  refreshTokenTtlSeconds: 2_592_000,
  supportElevationTtlSeconds: 900,
};

export function authStoreStub(overrides: Partial<AuthStore> = {}): AuthStore {
  const defaults: AuthStore = {
    consumeExternalAuthChallenge: () => Promise.resolve(undefined),
    consumePasswordReset: () => Promise.resolve({ kind: 'invalid' }),
    createPasswordReset: () => Promise.resolve(),
    createExternalAuthChallenge: () => Promise.resolve(),
    createSession: () => Promise.resolve(),
    createSupportElevation: () => Promise.resolve(undefined),
    findPasswordIdentity: () => Promise.resolve(undefined),
    getBranch: () => Promise.resolve(undefined),
    getMembership: () => Promise.resolve(undefined),
    getSessionClientType: () => Promise.resolve(undefined),
    getTeam: () => Promise.resolve(undefined),
    listAgencyClients: () => Promise.resolve([]),
    listAuthenticationMethods: () => Promise.resolve([]),
    listAvailableMemberships: () => Promise.resolve([]),
    listBranches: () => Promise.resolve([]),
    listSessions: () => Promise.resolve([]),
    listTeams: () => Promise.resolve([]),
    listTenantUsers: () => Promise.resolve([]),
    recordAuthenticationAudit: () => Promise.resolve(),
    recordLoginFailure: () => Promise.resolve(),
    recordLoginSuccess: () => Promise.resolve(),
    resolveGoogleLoginIdentity: () => Promise.resolve({ kind: 'not_invited' }),
    resolveSession: () => Promise.resolve({ kind: 'session_revoked' }),
    revokeAllSessions: () => Promise.resolve(0),
    revokeByRefreshToken: () => Promise.resolve(false),
    revokeSession: () => Promise.resolve(false),
    revokeSupportElevation: () => Promise.resolve(false),
    rotateRefreshToken: () => Promise.resolve({ kind: 'invalid' }),
    switchMembership: () => Promise.resolve(undefined),
    touchSession: () => Promise.resolve(),
    linkGoogleIdentity: () => Promise.resolve({ kind: 'identity_conflict' }),
    unlinkGoogleIdentity: () => Promise.resolve({ kind: 'identity_not_linked' }),
    validatePasswordReset: () => Promise.resolve(false),
  };

  return { ...defaults, ...overrides };
}
