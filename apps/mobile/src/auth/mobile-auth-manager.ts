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
}
