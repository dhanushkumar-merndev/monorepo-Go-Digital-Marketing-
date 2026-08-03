import { ApiResponseError, NetworkRequestError } from '../api/api-error';
import { MobileAuthManager } from '../auth/mobile-auth-manager';
import type { GoogleIdentityClient } from '../auth/google-identity-client';
import type { MobileSession } from '../auth/auth-types';
import { initialAuthState, setAuthState, useAuthStore } from '../store/auth-store';
import {
  FakeAuthTransport,
  MemoryCredentialVault,
  jsonResponse,
  sessionFixture,
} from './auth-test-fixtures';

const device = { deviceName: 'Android app', platform: 'android' } as const;

function managerFixture(session: MobileSession | null = sessionFixture()) {
  const queryCache = { clear: jest.fn() };
  const transport = new FakeAuthTransport();
  const vault = new MemoryCredentialVault(session);
  const manager = new MobileAuthManager({ device, queryCache, transport, vault });
  return { manager, queryCache, transport, vault };
}

function googleManagerFixture() {
  const queryCache = { clear: jest.fn() };
  const transport = new FakeAuthTransport();
  const vault = new MemoryCredentialVault(null);
  const googleIdentity: jest.Mocked<GoogleIdentityClient> = {
    authenticate: jest.fn<
      ReturnType<GoogleIdentityClient['authenticate']>,
      Parameters<GoogleIdentityClient['authenticate']>
    >(async () => ({ idToken: 'google-id-token', status: 'success' })),
    signOut: jest.fn<
      ReturnType<GoogleIdentityClient['signOut']>,
      Parameters<GoogleIdentityClient['signOut']>
    >(async () => undefined),
  };
  const manager = new MobileAuthManager({
    device,
    googleIdentity,
    queryCache,
    transport,
    vault,
  });
  return { googleIdentity, manager, queryCache, transport, vault };
}

describe('MobileAuthManager', () => {
  beforeEach(() => {
    setAuthState(initialAuthState);
  });

  it('bootstraps an unexpired secure session without exposing credentials in the store', async () => {
    const { manager, transport } = managerFixture();

    await manager.bootstrap();

    expect(transport.refresh).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      principal: expect.objectContaining({ email: 'asha@example.com' }),
      status: 'authenticated',
    });
    expect(useAuthStore.getState()).not.toHaveProperty('accessToken');
    expect(useAuthStore.getState()).not.toHaveProperty('refreshToken');
  });

  it('exchanges a nonce-bound Google identity for the existing secure CRM session', async () => {
    const { googleIdentity, manager, queryCache, transport, vault } = googleManagerFixture();

    await manager.loginWithGoogle();

    expect(transport.createGoogleChallenge).toHaveBeenCalledTimes(1);
    expect(googleIdentity.authenticate).toHaveBeenCalledWith({ nonce: 'a'.repeat(64) });
    expect(transport.googleLogin).toHaveBeenCalledWith(
      {
        challengeId: '10000000-0000-4000-8000-000000000099',
        idToken: 'google-id-token',
      },
      device,
    );
    expect(vault.save).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: expect.objectContaining({
          accessToken: 'access-token-one',
          refreshToken: 'refresh-token-one',
        }),
        principal: expect.objectContaining({ userId: 'user-1' }),
      }),
    );
    expect(queryCache.clear).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      principal: expect.objectContaining({ userId: 'user-1' }),
      status: 'authenticated',
    });
    expect(JSON.stringify(vault.session)).not.toContain('google-id-token');
  });

  it('leaves no error or CRM session when the user cancels Google sign-in', async () => {
    const { googleIdentity, manager, transport, vault } = googleManagerFixture();
    googleIdentity.authenticate.mockResolvedValueOnce({ status: 'cancelled' });

    await manager.loginWithGoogle();

    expect(transport.googleLogin).not.toHaveBeenCalled();
    expect(vault.save).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toEqual({ principal: null, status: 'unauthenticated' });
  });

  it('shows invitation and controlled-linking failures without trusting Google profile data', async () => {
    const invitationCase = googleManagerFixture();
    invitationCase.transport.googleLogin.mockRejectedValueOnce(
      new ApiResponseError(403, 'ACCOUNT_NOT_INVITED', 'UNKNOWN'),
    );

    await invitationCase.manager.loginWithGoogle();

    expect(useAuthStore.getState()).toEqual({
      message: 'This Google account has not been invited to Go Digital CRM.',
      principal: null,
      status: 'unauthenticated',
    });
    expect(invitationCase.googleIdentity.signOut).toHaveBeenCalled();

    setAuthState(initialAuthState);
    const linkingCase = googleManagerFixture();
    linkingCase.transport.googleLogin.mockRejectedValueOnce(
      new ApiResponseError(409, 'GOOGLE_ACCOUNT_LINKING_REQUIRED', 'UNKNOWN'),
    );

    await linkingCase.manager.loginWithGoogle();

    expect(useAuthStore.getState().message).toMatch(/email and password.*profile settings/iu);
    expect(linkingCase.vault.save).not.toHaveBeenCalled();
  });

  it('applies the existing disabled-account terminal state after Google login', async () => {
    const { manager, transport, vault } = googleManagerFixture();
    transport.googleLogin.mockRejectedValueOnce(
      new ApiResponseError(403, 'CLIENT_SUSPENDED', 'CLIENT_SUSPENDED'),
    );

    await manager.loginWithGoogle();

    expect(vault.clear).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      disabledReason: 'CLIENT_SUSPENDED',
      principal: null,
      status: 'disabled',
    });
  });

  it('shows a retryable state when the server-side Google provider is unavailable', async () => {
    const { manager, transport, vault } = googleManagerFixture();
    transport.googleLogin.mockRejectedValueOnce(
      new ApiResponseError(503, 'PROVIDER_UNAVAILABLE', 'UNKNOWN', undefined, true),
    );

    await manager.loginWithGoogle();

    expect(vault.save).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toEqual({
      message: 'Google sign-in is temporarily unavailable. Try again shortly.',
      principal: null,
      status: 'unauthenticated',
    });
  });

  it('does not let Google login bypass the mobile-role boundary', async () => {
    const { googleIdentity, manager, transport, vault } = googleManagerFixture();
    const officeSession = sessionFixture({ roleCode: 'CLIENT_ADMIN' });
    transport.googleLogin.mockResolvedValueOnce(officeSession);

    await manager.loginWithGoogle();

    expect(transport.logout).toHaveBeenCalledWith(officeSession);
    expect(vault.save).not.toHaveBeenCalled();
    expect(googleIdentity.signOut).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unsupported-role');
  });

  it('uses one refresh for concurrent expired requests and replays each request once', async () => {
    const { manager, transport, vault } = managerFixture();
    await manager.bootstrap();

    transport.authorizedRequest.mockImplementation(async (session) =>
      session.credentials.accessToken === 'access-token-one'
        ? jsonResponse(401, {
            error: {
              code: 'SESSION_EXPIRED',
              correlation_id: 'request-1',
              details: [],
              message: 'Expired',
              retryable: false,
            },
          })
        : jsonResponse(200, { ok: true }),
    );

    const [first, second] = await Promise.all([
      manager.request('/assigned-work'),
      manager.request('/profile'),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(transport.refresh).toHaveBeenCalledTimes(1);
    expect(transport.authorizedRequest).toHaveBeenCalledTimes(4);
    expect(vault.save).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: expect.objectContaining({ refreshToken: 'refresh-two' }),
      }),
    );
  });

  it('preserves the vault on a refresh network failure but clears revoked sessions', async () => {
    const expired = sessionFixture({
      accessTokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    const networkCase = managerFixture(expired);
    networkCase.transport.refresh.mockRejectedValueOnce(new NetworkRequestError());

    await networkCase.manager.bootstrap();

    expect(networkCase.vault.clear).not.toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('session-expired');

    setAuthState(initialAuthState);
    const revokedCase = managerFixture(expired);
    revokedCase.transport.refresh.mockRejectedValueOnce(
      new ApiResponseError(401, 'SESSION_REVOKED', 'SESSION_REVOKED'),
    );

    await revokedCase.manager.bootstrap();

    expect(revokedCase.vault.clear).toHaveBeenCalled();
    expect(revokedCase.queryCache.clear).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('session-expired');
  });

  it('does not refresh a request whose session was explicitly revoked', async () => {
    const { manager, queryCache, transport, vault } = managerFixture();
    await manager.bootstrap();
    queryCache.clear.mockClear();
    transport.authorizedRequest.mockResolvedValueOnce(
      jsonResponse(401, {
        error: {
          code: 'SESSION_REVOKED',
          correlation_id: 'request-revoked',
          details: [],
          message: 'Revoked',
          retryable: false,
        },
      }),
    );

    await expect(manager.request('/profile')).rejects.toMatchObject({
      reason: 'SESSION_REVOKED',
    });

    expect(transport.refresh).not.toHaveBeenCalled();
    expect(vault.clear).toHaveBeenCalled();
    expect(queryCache.clear).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('session-expired');
  });

  it('routes disabled accounts to a distinct state and removes credentials', async () => {
    const { manager, transport, vault } = managerFixture(null);
    transport.login.mockRejectedValueOnce(
      new ApiResponseError(403, 'ACCOUNT_SUSPENDED', 'USER_SUSPENDED'),
    );

    await manager.login({ email: 'asha@example.com', password: 'secret' });

    expect(vault.clear).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      disabledReason: 'USER_SUSPENDED',
      principal: null,
      status: 'disabled',
    });
  });

  it('keeps invalid credentials on the login surface without exposing server detail', async () => {
    const { manager, transport } = managerFixture(null);
    transport.login.mockRejectedValueOnce(
      new ApiResponseError(401, 'INVALID_CREDENTIALS', 'INVALID_CREDENTIALS'),
    );

    await manager.login({ email: 'asha@example.com', password: 'wrong-password' });

    expect(useAuthStore.getState()).toEqual({
      message: 'The email address or password is incorrect.',
      principal: null,
      status: 'unauthenticated',
    });
  });

  it('rejects an office role, revokes its new session and never persists it', async () => {
    const { manager, transport, vault } = managerFixture(null);
    transport.login.mockResolvedValueOnce(sessionFixture({ roleCode: 'CLIENT_ADMIN' }));

    await manager.login({ email: 'admin@example.com', password: 'secret' });

    expect(transport.logout).toHaveBeenCalledTimes(1);
    expect(vault.save).not.toHaveBeenCalled();
    expect(vault.clear).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('unsupported-role');
  });

  it('clears secure credentials and query data on logout even when remote revocation fails', async () => {
    const { manager, queryCache, transport, vault } = managerFixture();
    await manager.bootstrap();
    queryCache.clear.mockClear();
    transport.logout.mockRejectedValueOnce(new NetworkRequestError());

    await expect(manager.logout()).resolves.toEqual({ remoteSessionRevoked: false });

    expect(vault.clear).toHaveBeenCalled();
    expect(queryCache.clear).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({ principal: null, status: 'unauthenticated' });
  });

  it('does not let a Google SDK sign-out failure block CRM revocation or local cleanup', async () => {
    const { googleIdentity, manager, queryCache, transport, vault } = googleManagerFixture();
    const session = sessionFixture();
    transport.googleLogin.mockResolvedValueOnce(session);
    await manager.loginWithGoogle();
    queryCache.clear.mockClear();
    googleIdentity.signOut.mockRejectedValueOnce(new Error('provider unavailable'));

    await expect(manager.logout()).resolves.toEqual({ remoteSessionRevoked: true });

    expect(transport.logout).toHaveBeenCalledWith(session);
    expect(vault.clear).toHaveBeenCalled();
    expect(queryCache.clear).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});
