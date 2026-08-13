'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ApiClientError, authApiClient } from './auth-api-client';
import type { AuthApiClient } from './auth-api-client';
import type {
  AuthenticationMethod,
  AuthSession,
  GoogleAuthChallenge,
  GoogleCredentialInput,
  GoogleIdentityUnlinkResult,
  LoginInput,
  MfaEnrollmentSetup,
  MfaLoginChallenge,
  PasswordResetInput,
  SessionDevice,
  StartSupportElevationInput,
} from './auth-types';
import { resetFeatureUiState } from './feature-ui-reset';
import { loginPath, safeReturnPath } from './safe-return-path';
import { authorizationContextFingerprint, withoutSupportElevation } from './session-context';

export type AuthStatus = 'anonymous' | 'authenticated' | 'error' | 'expired' | 'loading';

export interface AuthContextValue {
  api: AuthApiClient;
  createGoogleLinkChallenge(): Promise<GoogleAuthChallenge>;
  createGoogleLoginChallenge(): Promise<GoogleAuthChallenge>;
  endSupportElevation(): Promise<void>;
  error: ApiClientError | null;
  linkGoogleIdentity(input: GoogleCredentialInput): Promise<void>;
  listAuthenticationMethods(): Promise<AuthenticationMethod[]>;
  listSessions(): Promise<SessionDevice[]>;
  login(input: LoginInput, returnTo?: string): Promise<MfaLoginChallenge | null | undefined>;
  loginWithGoogle(
    input: GoogleCredentialInput,
    returnTo?: string,
  ): Promise<MfaLoginChallenge | null | undefined>;
  startMfaEnrollment(challengeToken: string): Promise<MfaEnrollmentSetup>;
  confirmMfaEnrollment(challengeToken: string, code: string, returnTo?: string): Promise<string[]>;
  verifyMfa(
    challengeToken: string,
    method: 'RECOVERY_CODE' | 'TOTP',
    code: string,
    returnTo?: string,
  ): Promise<string | undefined>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  refreshProfile(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(input: PasswordResetInput): Promise<void>;
  retryInitialization(): Promise<void>;
  revokeSession(sessionId: string): Promise<void>;
  session: AuthSession | null;
  startSupportElevation(input: StartSupportElevationInput): Promise<void>;
  status: AuthStatus;
  switchMembership(membershipId: string): Promise<void>;
  unlinkGoogleIdentity(): Promise<GoogleIdentityUnlinkResult>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  client?: AuthApiClient;
}

interface SessionTransitionOptions {
  forceReset?: boolean;
}

const MAX_BROWSER_TIMEOUT_MS = 2_147_483_647;

const disabledSessionCodes = new Set([
  'ACCOUNT_DISABLED',
  'ACCOUNT_INACTIVE',
  'ACCOUNT_SUSPENDED',
  'CLIENT_INACTIVE',
  'MEMBERSHIP_INACTIVE',
]);

export function AuthProvider({ children, client = authApiClient }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<ApiClientError | null>(null);
  const sessionRef = useRef<AuthSession | null>(null);
  const contextVersionRef = useRef(0);
  const authenticationAttemptRef = useRef(false);
  const supportRestoreRef = useRef<Promise<void> | null>(null);

  const transitionSession = useCallback(
    (nextSession: AuthSession | null, options: SessionTransitionOptions = {}) => {
      const contextChanged =
        authorizationContextFingerprint(sessionRef.current) !==
        authorizationContextFingerprint(nextSession);

      if (contextChanged || options.forceReset === true) {
        queryClient.clear();
        resetFeatureUiState();
      }

      sessionRef.current = nextSession;
      contextVersionRef.current += 1;
      setSession(nextSession);
    },
    [queryClient],
  );

  const expireSession = useCallback(
    (reason: ApiClientError) => {
      // A stale initialization request can finish after a fresh password/Google
      // attempt starts. The active attempt owns its error UI and must not be
      // replaced by the session-ended route from that older request.
      if (authenticationAttemptRef.current) return;

      client.clearAccessToken();
      transitionSession(null, { forceReset: true });
      setError(null);
      setStatus('expired');

      if (typeof window === 'undefined') {
        return;
      }

      const currentPath = safeReturnPath(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
      const parameters = new URLSearchParams();
      if (currentPath !== '/') parameters.set('returnTo', currentPath);
      if (disabledSessionCodes.has(reason.code)) parameters.set('reason', 'disabled');
      const query = parameters.toString();
      router.replace(query.length === 0 ? '/session-expired' : `/session-expired?${query}`);
    },
    [client, router, transitionSession],
  );

  const handleMfaRequired = useCallback(() => {
    // A stale initialization request can finish after a fresh password/Google
    // attempt starts. The active attempt owns its error UI and must not be
    // replaced by this route from that older request.
    if (authenticationAttemptRef.current) return;

    client.clearAccessToken();
    transitionSession(null, { forceReset: true });
    setError(null);
    setStatus('anonymous');

    if (typeof window === 'undefined') {
      return;
    }

    const currentPath = safeReturnPath(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    router.replace(`/auth/mfa?returnTo=${encodeURIComponent(currentPath)}`);
  }, [client, router, transitionSession]);

  const restoreAgencyContext = useCallback(
    (expectedSupportElevationId?: string): Promise<void> => {
      if (supportRestoreRef.current !== null) return supportRestoreRef.current;

      const elevatedSession = sessionRef.current;
      const elevation = elevatedSession?.supportElevation;
      if (
        elevatedSession === null ||
        elevation === null ||
        elevation === undefined ||
        (expectedSupportElevationId !== undefined && elevation.id !== expectedSupportElevationId)
      ) {
        return Promise.resolve();
      }

      const safeAgencySession = withoutSupportElevation(elevatedSession);
      setError(null);
      setStatus('loading');
      transitionSession(safeAgencySession, { forceReset: true });
      router.replace('/');
      const restoreVersion = contextVersionRef.current;

      const restoration = (async () => {
        try {
          const restored = await client.me();
          if (contextVersionRef.current !== restoreVersion) return;
          transitionSession(restored);
          setStatus('authenticated');
        } catch (caught) {
          if (contextVersionRef.current !== restoreVersion) return;
          const reason = toApiClientError(caught);

          if (reason.status === 401) {
            expireSession(reason);
            return;
          }

          if (reason.status === 403 || reason.status === 404) {
            // The support grant is already unusable. The locally stripped agency
            // context contains no client authority or cached client data.
            setError(null);
            setStatus('authenticated');
            return;
          }

          transitionSession(null, { forceReset: true });
          setError(reason);
          setStatus('error');
        } finally {
          supportRestoreRef.current = null;
        }
      })();

      supportRestoreRef.current = restoration;
      return restoration;
    },
    [client, expireSession, router, transitionSession],
  );

  useEffect(() => {
    client.setSessionExpiredHandler(expireSession);
    client.setMfaRequiredHandler(handleMfaRequired);
    client.setSupportElevationExpiredHandler(() => {
      const elevationId = sessionRef.current?.supportElevation?.id;
      if (elevationId !== undefined) void restoreAgencyContext(elevationId);
    });
    return () => {
      client.setSessionExpiredHandler(null);
      client.setMfaRequiredHandler(null);
      client.setSupportElevationExpiredHandler(null);
    };
  }, [client, expireSession, handleMfaRequired, restoreAgencyContext]);

  useEffect(() => {
    const elevation = session?.supportElevation;
    if (elevation === null || elevation === undefined) return;

    let timeout: number | undefined;
    const expireAtBoundary = () => {
      const remaining = Date.parse(elevation.expiresAt) - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        void restoreAgencyContext(elevation.id);
        return;
      }

      timeout = window.setTimeout(expireAtBoundary, Math.min(remaining, MAX_BROWSER_TIMEOUT_MS));
    };

    expireAtBoundary();
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [restoreAgencyContext, session?.supportElevation]);

  const initialize = useCallback(async () => {
    const initializationVersion = contextVersionRef.current;
    setError(null);
    setStatus('loading');

    try {
      const restored = await client.restoreSession();
      if (contextVersionRef.current !== initializationVersion) return;
      if (!restored) {
        transitionSession(null, { forceReset: true });
        setStatus('anonymous');
        return;
      }

      const restoredSession = await client.me();
      if (contextVersionRef.current !== initializationVersion) return;
      if (restoredSession.user.status === 'suspended') {
        expireSession(new ApiClientError('This account is suspended.', 403, 'ACCOUNT_SUSPENDED'));
        return;
      }
      transitionSession(restoredSession);
      setStatus('authenticated');
    } catch (caught) {
      if (contextVersionRef.current !== initializationVersion) return;
      if (caught instanceof ApiClientError && caught.status === 401) {
        transitionSession(null, { forceReset: true });
        setStatus('anonymous');
        return;
      }
      transitionSession(null, { forceReset: true });
      setError(toApiClientError(caught));
      setStatus('error');
    }
  }, [client, expireSession, transitionSession]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void initialize(), 0);
    return () => window.clearTimeout(timeout);
  }, [initialize]);

  const finishLogin = useCallback(
    (authenticatedSession: AuthSession, returnTo?: string, navigate = true) => {
      if (authenticatedSession.user.status === 'suspended') {
        client.clearAccessToken();
        throw new ApiClientError('This account is suspended.', 403, 'ACCOUNT_SUSPENDED');
      }
      setError(null);
      transitionSession(authenticatedSession);
      setStatus('authenticated');
      if (navigate) router.replace(safeReturnPath(returnTo));
    },
    [client, router, transitionSession],
  );

  const login = useCallback(
    async (input: LoginInput, returnTo?: string) => {
      authenticationAttemptRef.current = true;
      contextVersionRef.current += 1;
      try {
        const result = await client.login(input);
        if ('status' in result) return result;
        finishLogin(result, `/auth/mfa?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
        return null;
      } catch (caught) {
        const reason = toApiClientError(caught);
        if (reason.code === 'MFA_REQUIRED') {
          transitionSession(null, { forceReset: true });
          setStatus('anonymous');
          router.replace(`/auth/mfa?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
          return null;
        }
        throw caught;
      } finally {
        authenticationAttemptRef.current = false;
      }
    },
    [client, finishLogin, router, transitionSession],
  );

  const loginWithGoogle = useCallback(
    async (input: GoogleCredentialInput, returnTo?: string) => {
      authenticationAttemptRef.current = true;
      contextVersionRef.current += 1;
      try {
        const result = await client.loginWithGoogle(input);
        if ('status' in result) return result;
        finishLogin(result, returnTo);
        return null;
      } catch (caught) {
        const reason = toApiClientError(caught);
        if (reason.code === 'MFA_REQUIRED') {
          // Supabase Google sign-in has already established an aal1 browser
          // session. Keep that session intact so /auth/mfa can upgrade it to
          // aal2; treating this expected response as a failed Google login
          // leaves the user on /login with a misleading error.
          transitionSession(null, { forceReset: true });
          setError(null);
          setStatus('anonymous');
          router.replace(`/auth/mfa?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
          return null;
        }
        throw caught;
      } finally {
        authenticationAttemptRef.current = false;
      }
    },
    [client, finishLogin, router, transitionSession],
  );

  const startMfaEnrollment = useCallback(
    (challengeToken: string) => client.startMfaEnrollment(challengeToken),
    [client],
  );

  const confirmMfaEnrollment = useCallback(
    async (challengeToken: string, code: string, returnTo?: string) => {
      const result = await client.confirmMfaEnrollment(challengeToken, code);
      finishLogin(result.session, returnTo, false);
      return result.recoveryCodes;
    },
    [client, finishLogin],
  );

  const verifyMfa = useCallback(
    async (
      challengeToken: string,
      method: 'RECOVERY_CODE' | 'TOTP',
      code: string,
      returnTo?: string,
    ) => {
      const result = await client.verifyMfa(challengeToken, method, code);
      finishLogin(result.session, returnTo, result.replacementRecoveryCode === undefined);
      return result.replacementRecoveryCode;
    },
    [client, finishLogin],
  );

  const unlinkGoogleIdentity = useCallback(async () => {
    const result = await client.unlinkGoogleIdentity();
    if (result.currentSessionRevoked) {
      transitionSession(null, { forceReset: true });
      setError(null);
      setStatus('expired');
      router.replace('/session-expired');
    }
    return result;
  }, [client, router, transitionSession]);

  const logout = useCallback(async () => {
    try {
      await client.logout();
    } finally {
      transitionSession(null, { forceReset: true });
      setError(null);
      setStatus('anonymous');
      router.replace('/login');
    }
  }, [client, router, transitionSession]);

  const logoutAll = useCallback(async () => {
    try {
      await client.logoutAll();
    } finally {
      transitionSession(null, { forceReset: true });
      setError(null);
      setStatus('anonymous');
      router.replace('/login');
    }
  }, [client, router, transitionSession]);

  const refreshProfile = useCallback(async () => {
    const refreshVersion = contextVersionRef.current;
    const refreshed = await client.me();
    if (contextVersionRef.current !== refreshVersion) return;
    if (refreshed.user.status === 'suspended') {
      expireSession(new ApiClientError('This account is suspended.', 403, 'ACCOUNT_SUSPENDED'));
      return;
    }
    transitionSession(refreshed);
    setStatus('authenticated');
  }, [client, expireSession, transitionSession]);

  const switchMembership = useCallback(
    async (membershipId: string) => {
      const switched = await client.switchMembership(membershipId);
      transitionSession(switched);
    },
    [client, transitionSession],
  );

  const startSupportElevation = useCallback(
    async (input: StartSupportElevationInput) => {
      const elevated = await client.startSupportElevation(input);
      transitionSession(elevated);
    },
    [client, transitionSession],
  );

  const endSupportElevation = useCallback(async () => {
    const elevationId = sessionRef.current?.supportElevation?.id;
    try {
      const restored = await client.endSupportElevation();
      transitionSession(restored);
    } catch (caught) {
      const reason = toApiClientError(caught);
      if (elevationId !== undefined && (reason.status === 403 || reason.status === 404)) {
        await restoreAgencyContext(elevationId);
        return;
      }
      throw caught;
    }
  }, [client, restoreAgencyContext, transitionSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      api: client,
      createGoogleLinkChallenge: () => client.createGoogleLinkChallenge(),
      createGoogleLoginChallenge: () => client.createGoogleLoginChallenge(),
      endSupportElevation,
      error,
      linkGoogleIdentity: (input) => client.linkGoogleIdentity(input),
      listAuthenticationMethods: () => client.listAuthenticationMethods(),
      listSessions: () => client.listSessions(),
      login,
      loginWithGoogle,
      startMfaEnrollment,
      confirmMfaEnrollment,
      verifyMfa,
      logout,
      logoutAll,
      refreshProfile,
      requestPasswordReset: (email) => client.requestPasswordReset(email),
      resetPassword: (input) => client.resetPassword(input),
      retryInitialization: initialize,
      revokeSession: (sessionId) => client.revokeSession(sessionId),
      session,
      startSupportElevation,
      status,
      switchMembership,
      unlinkGoogleIdentity,
    }),
    [
      client,
      endSupportElevation,
      error,
      initialize,
      login,
      loginWithGoogle,
      startMfaEnrollment,
      confirmMfaEnrollment,
      verifyMfa,
      logout,
      logoutAll,
      refreshProfile,
      session,
      startSupportElevation,
      status,
      switchMembership,
      unlinkGoogleIdentity,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

export function useLoginRedirect(): string {
  const pathname = usePathname();
  if (typeof window === 'undefined') {
    return '/login';
  }
  return loginPath(`${pathname}${window.location.search}${window.location.hash}`);
}

function toApiClientError(error: unknown): ApiClientError {
  return error instanceof ApiClientError
    ? error
    : new ApiClientError(
        'The application could not restore your session.',
        0,
        'SESSION_RESTORE_FAILED',
      );
}
