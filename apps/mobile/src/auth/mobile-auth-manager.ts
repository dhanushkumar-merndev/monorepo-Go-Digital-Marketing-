import {
  ApiResponseError,
  InvalidApiResponseError,
  NetworkRequestError,
  apiResponseError,
  isDisabledAuthFailure,
  isExpiredSessionFailure,
} from '../api/api-error';
import type { AuthTransport } from '../api/auth-transport';
import { setAuthState } from '../store/auth-store';
import type { CredentialVault } from './credential-vault';
import { GoogleIdentityError, type GoogleIdentityClient } from './google-identity-client';
import {
  isMobileRoleCode,
  type DeviceSessionMetadata,
  type DisabledReason,
  type LoginInput,
  type LogoutResult,
  type MobileSession,
} from './auth-types';

export interface QueryCacheController {
  clear(): void;
}

export interface MobileAuthManagerDependencies {
  device: DeviceSessionMetadata;
  googleIdentity?: GoogleIdentityClient;
  now?: () => number;
  queryCache: QueryCacheController;
  transport: AuthTransport;
  vault: CredentialVault;
}

const accessTokenLeewayMs = 30_000;

function disabledReason(error: ApiResponseError): DisabledReason {
  switch (error.reason) {
    case 'CLIENT_SUSPENDED':
      return 'CLIENT_SUSPENDED';
    case 'MEMBERSHIP_INACTIVE':
      return 'MEMBERSHIP_INACTIVE';
    case 'USER_SUSPENDED':
      return 'USER_SUSPENDED';
    default:
      return 'USER_SUSPENDED';
  }
}

export class MobileAuthManager {
  private bootstrapPromise: Promise<void> | null = null;
  private currentSession: MobileSession | null = null;
  private refreshPromise: Promise<MobileSession> | null = null;
  private readonly now: () => number;

  constructor(private readonly dependencies: MobileAuthManagerDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  get googleLoginAvailable(): boolean {
    return this.dependencies.googleIdentity !== undefined;
  }

  bootstrap(): Promise<void> {
    this.bootstrapPromise ??= this.performBootstrap().finally(() => {
      this.bootstrapPromise = null;
    });
    return this.bootstrapPromise;
  }

  async login(input: LoginInput): Promise<void> {
    setAuthState({ principal: null, status: 'authenticating' });

    try {
      const session = await this.dependencies.transport.login(input, this.dependencies.device);
      await this.acceptSession(session, true);
    } catch (error: unknown) {
      if (isDisabledAuthFailure(error)) {
        await this.terminateDisabled(error);
        return;
      }

      if (error instanceof NetworkRequestError) {
        setAuthState({
          message: 'The server could not be reached. Check your connection and try again.',
          principal: null,
          status: 'unauthenticated',
        });
        return;
      }

      if (error instanceof ApiResponseError && error.reason === 'INVALID_CREDENTIALS') {
        setAuthState({
          message: 'The email address or password is incorrect.',
          principal: null,
          status: 'unauthenticated',
        });
        return;
      }

      setAuthState({
        message: 'Sign-in could not be completed. Try again.',
        principal: null,
        status: 'unauthenticated',
      });
    }
  }

  async loginWithGoogle(): Promise<void> {
    setAuthState({ principal: null, status: 'authenticating' });

    const googleIdentity = this.dependencies.googleIdentity;
    if (!googleIdentity) {
      setAuthState({
        message: 'Google sign-in is not configured for this app build.',
        principal: null,
        status: 'unauthenticated',
      });
      return;
    }

    try {
      const challenge = await this.dependencies.transport.createGoogleChallenge();
      const identity = await googleIdentity.authenticate({ nonce: challenge.nonce });
      if (identity.status === 'cancelled') {
        setAuthState({ principal: null, status: 'unauthenticated' });
        return;
      }

      const session = await this.dependencies.transport.googleLogin(
        { challengeId: challenge.challengeId, idToken: identity.idToken },
        this.dependencies.device,
      );
      await this.acceptSession(session, true);
      if (!isMobileRoleCode(session.principal.roleCode)) {
        await this.clearGoogleProviderSession();
      }
    } catch (error: unknown) {
      await this.clearGoogleProviderSession();

      if (isDisabledAuthFailure(error)) {
        await this.terminateDisabled(error);
        return;
      }

      if (error instanceof NetworkRequestError) {
        setAuthState({
          message: 'The server could not be reached. Check your connection and try again.',
          principal: null,
          status: 'unauthenticated',
        });
        return;
      }

      if (error instanceof GoogleIdentityError) {
        setAuthState({
          message: googleIdentityFailureMessage(error),
          principal: null,
          status: 'unauthenticated',
        });
        return;
      }

      if (error instanceof ApiResponseError) {
        const message = googleApiFailureMessage(error);
        if (message) {
          setAuthState({ message, principal: null, status: 'unauthenticated' });
          return;
        }
      }

      setAuthState({
        message: 'Google sign-in could not be completed. Try again.',
        principal: null,
        status: 'unauthenticated',
      });
    }
  }

  async logout(): Promise<LogoutResult> {
    const session = this.currentSession;
    let remoteSessionRevoked = false;

    if (session) {
      try {
        await this.dependencies.transport.logout(session);
        remoteSessionRevoked = true;
      } catch {
        // Local credentials are still removed. Refresh tokens are never queued in SQLite.
      }
    }

    await this.clearGoogleProviderSession();

    await this.clearLocalSession();
    setAuthState({
      ...(remoteSessionRevoked
        ? {}
        : {
            message:
              'Signed out on this device. The server could not confirm remote session revocation.',
          }),
      principal: null,
      status: 'unauthenticated',
    });

    return { remoteSessionRevoked };
  }

  async resetForAnotherAccount(): Promise<void> {
    await this.clearGoogleProviderSession();
    await this.clearLocalSession();
    setAuthState({ principal: null, status: 'unauthenticated' });
  }

  async retrySession(): Promise<void> {
    let stored: MobileSession | null;
    try {
      stored = this.currentSession ?? (await this.dependencies.vault.load());
    } catch {
      setAuthState({
        message: 'The secure session could not be opened. Sign in again.',
        principal: null,
        status: 'unauthenticated',
      });
      return;
    }

    if (!stored) {
      setAuthState({ principal: null, status: 'unauthenticated' });
      return;
    }

    this.currentSession = stored;
    setAuthState({ principal: null, status: 'bootstrapping' });

    try {
      await this.refreshSession();
    } catch {
      // refreshSession has already selected the safe terminal or retryable state.
    }
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const session = this.currentSession;
    if (!session) {
      throw new ApiResponseError(401, 'UNAUTHENTICATED', 'SESSION_REVOKED');
    }

    const response = await this.dependencies.transport.authorizedRequest(session, path, init);
    if (response.status !== 401) {
      if (response.status === 403) {
        await this.handleTerminalResponse(response);
      }
      return response;
    }

    const initialError = await apiResponseError(response.clone());
    if (initialError.reason !== 'SESSION_EXPIRED') {
      await this.handleTerminalError(initialError);
      throw initialError;
    }

    await this.refreshSession();
    const refreshedSession = this.currentSession;
    if (!refreshedSession) {
      throw new ApiResponseError(401, 'UNAUTHENTICATED', 'SESSION_REVOKED');
    }

    const replay = await this.dependencies.transport.authorizedRequest(
      refreshedSession,
      path,
      init,
    );
    if (replay.status === 401 || replay.status === 403) {
      await this.handleTerminalResponse(replay);
    }

    return replay;
  }

  private async performBootstrap(): Promise<void> {
    setAuthState({ principal: null, status: 'bootstrapping' });

    let session: MobileSession | null;
    try {
      session = await this.dependencies.vault.load();
    } catch {
      setAuthState({
        message: 'The secure session could not be opened. Sign in again.',
        principal: null,
        status: 'unauthenticated',
      });
      return;
    }

    if (!session) {
      setAuthState({ principal: null, status: 'unauthenticated' });
      return;
    }

    this.currentSession = session;
    if (!isMobileRoleCode(session.principal.roleCode)) {
      await this.rejectUnsupportedRole(session);
      return;
    }

    if (Date.parse(session.credentials.accessTokenExpiresAt) > this.now() + accessTokenLeewayMs) {
      setAuthState({ principal: session.principal, status: 'authenticated' });
      return;
    }

    try {
      await this.refreshSession();
    } catch {
      // refreshSession has already selected the safe terminal or retryable state.
    }
  }

  private refreshSession(): Promise<MobileSession> {
    this.refreshPromise ??= this.performRefresh()
      .catch(async (error: unknown) => {
        await this.handleRefreshFailure(error);
        throw error;
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<MobileSession> {
    const previous = this.currentSession;
    if (!previous) {
      throw new ApiResponseError(401, 'UNAUTHENTICATED', 'SESSION_REVOKED');
    }

    const refreshed = await this.dependencies.transport.refresh(previous);

    if (refreshed.credentials.refreshToken === previous.credentials.refreshToken) {
      throw new InvalidApiResponseError();
    }

    await this.acceptSession(refreshed, false);
    return refreshed;
  }

  private async acceptSession(session: MobileSession, clearQueries: boolean): Promise<void> {
    if (!isMobileRoleCode(session.principal.roleCode)) {
      await this.rejectUnsupportedRole(session);
      return;
    }

    try {
      await this.dependencies.vault.save(session);
    } catch (error: unknown) {
      try {
        await this.dependencies.transport.logout(session);
      } catch {
        // Best effort only; no credential is retained by the runtime.
      }
      try {
        await this.dependencies.vault.clear();
      } catch {
        // The runtime still fails closed and never exposes the unpersisted grant.
      }
      this.currentSession = null;
      this.dependencies.queryCache.clear();
      setAuthState({
        message: 'This device could not securely save the session. Sign in again.',
        principal: null,
        status: 'unauthenticated',
      });
      throw error;
    }

    if (clearQueries) {
      this.dependencies.queryCache.clear();
    }
    this.currentSession = session;
    setAuthState({ principal: session.principal, status: 'authenticated' });
  }

  private async rejectUnsupportedRole(session: MobileSession): Promise<void> {
    try {
      await this.dependencies.transport.logout(session);
    } catch {
      // The local credential is cleared even if remote revocation is unavailable.
    }
    await this.clearLocalSession();
    setAuthState({
      message: 'This role uses the office web dashboard and cannot open the mobile workspace.',
      principal: null,
      status: 'unsupported-role',
    });
  }

  private async handleRefreshFailure(error: unknown): Promise<void> {
    if (error instanceof NetworkRequestError) {
      setAuthState({
        message: 'Reconnect to refresh this session. Your secure token has not been removed.',
        principal: null,
        status: 'session-expired',
      });
      return;
    }

    if (isDisabledAuthFailure(error)) {
      await this.terminateDisabled(error);
      return;
    }

    await this.terminateExpired('This session could not be validated securely. Sign in again.');
  }

  private async handleTerminalResponse(response: Response): Promise<void> {
    const error = await apiResponseError(response.clone());
    await this.handleTerminalError(error);
  }

  private async handleTerminalError(error: unknown): Promise<void> {
    if (isDisabledAuthFailure(error)) {
      await this.terminateDisabled(error);
      return;
    }

    if (isExpiredSessionFailure(error)) {
      await this.terminateExpired('This session has expired or was revoked. Sign in again.');
    }
  }

  private async terminateDisabled(error: ApiResponseError): Promise<void> {
    await this.clearLocalSession();
    setAuthState({
      disabledReason: disabledReason(error),
      message: 'This account or dealership is disabled. Contact an administrator for access.',
      principal: null,
      status: 'disabled',
    });
  }

  private async terminateExpired(message: string): Promise<void> {
    await this.clearLocalSession();
    setAuthState({ message, principal: null, status: 'session-expired' });
  }

  private async clearLocalSession(): Promise<void> {
    this.currentSession = null;
    this.dependencies.queryCache.clear();
    try {
      await this.dependencies.vault.clear();
    } catch {
      // Runtime access is still removed. A revoked/invalid credential cannot authorize requests.
    }
  }

  private async clearGoogleProviderSession(): Promise<void> {
    try {
      await this.dependencies.googleIdentity?.signOut();
    } catch {
      // Google SDK state is never an authorization grant. CRM credentials still fail closed.
    }
  }
}

function googleIdentityFailureMessage(error: GoogleIdentityError): string {
  switch (error.reason) {
    case 'CONFIGURATION':
      return 'Google sign-in is not configured correctly for this app build.';
    case 'IN_PROGRESS':
      return 'A Google sign-in is already in progress.';
    case 'PLAY_SERVICES_UNAVAILABLE':
      return 'Google Play services is unavailable or needs an update.';
    case 'PROVIDER_UNAVAILABLE':
      return 'Google sign-in is unavailable right now. Try again.';
  }
}

function googleApiFailureMessage(error: ApiResponseError): string | undefined {
  const code = String(error.code).toUpperCase();

  if (code === 'PROVIDER_UNAVAILABLE') {
    return 'Google sign-in is temporarily unavailable. Try again shortly.';
  }

  if (
    code === 'ACCOUNT_NOT_INVITED' ||
    code === 'GOOGLE_ACCOUNT_NOT_INVITED' ||
    code === 'IDENTITY_NOT_INVITED'
  ) {
    return 'This Google account has not been invited to Go Digital CRM.';
  }

  if (
    code === 'ACCOUNT_LINKING_REQUIRED' ||
    code === 'GOOGLE_ACCOUNT_LINKING_REQUIRED' ||
    code === 'GOOGLE_IDENTITY_NOT_LINKED' ||
    code === 'GOOGLE_LINK_REQUIRED'
  ) {
    return 'This Google account is not connected. Sign in with email and password, then connect Google from profile settings.';
  }

  if (code === 'GOOGLE_EMAIL_UNVERIFIED') {
    return 'Google must verify this account email before it can sign in.';
  }

  if (code === 'GOOGLE_IDENTITY_CONFLICT') {
    return 'This Google identity is already connected to another account. Contact an administrator.';
  }

  if (
    code === 'GOOGLE_CHALLENGE_EXPIRED' ||
    code === 'GOOGLE_CHALLENGE_INVALID' ||
    code === 'INVALID_GOOGLE_CHALLENGE'
  ) {
    return 'Google sign-in expired. Try again.';
  }

  if (
    code === 'GOOGLE_TOKEN_INVALID' ||
    code === 'INVALID_GOOGLE_TOKEN' ||
    code === 'GOOGLE_AUTHENTICATION_FAILED'
  ) {
    return 'Google could not verify this sign-in. Try again.';
  }

  return undefined;
}
