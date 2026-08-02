'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ApiClientError, authApiClient } from './auth-api-client';
import type { AuthApiClient } from './auth-api-client';
import type {
  AuthSession,
  LoginInput,
  PasswordResetInput,
  SessionDevice,
  StartSupportElevationInput,
} from './auth-types';
import { loginPath, safeReturnPath } from './safe-return-path';

export type AuthStatus = 'anonymous' | 'authenticated' | 'error' | 'expired' | 'loading';

export interface AuthContextValue {
  api: AuthApiClient;
  endSupportElevation(): Promise<void>;
  error: ApiClientError | null;
  listSessions(): Promise<SessionDevice[]>;
  login(input: LoginInput, returnTo?: string): Promise<void>;
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
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  client?: AuthApiClient;
}

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

  const expireSession = useCallback(
    (reason: ApiClientError) => {
      setSession(null);
      setError(null);
      setStatus('expired');
      queryClient.clear();

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
    [queryClient, router],
  );

  useEffect(() => {
    client.setSessionExpiredHandler(expireSession);
    return () => client.setSessionExpiredHandler(null);
  }, [client, expireSession]);

  const initialize = useCallback(async () => {
    setError(null);
    setStatus('loading');

    const restored = await client.restoreSession();
    if (!restored) {
      setSession(null);
      setStatus('anonymous');
      return;
    }

    try {
      const restoredSession = await client.me();
      if (restoredSession.user.status === 'suspended') {
        expireSession(new ApiClientError('This account is suspended.', 403, 'ACCOUNT_SUSPENDED'));
        return;
      }
      setSession(restoredSession);
      setStatus('authenticated');
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        setSession(null);
        setStatus('anonymous');
        return;
      }
      setError(toApiClientError(caught));
      setStatus('error');
    }
  }, [client, expireSession]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void initialize(), 0);
    return () => window.clearTimeout(timeout);
  }, [initialize]);

  const login = useCallback(
    async (input: LoginInput, returnTo?: string) => {
      const authenticatedSession = await client.login(input);
      if (authenticatedSession.user.status === 'suspended') {
        client.clearAccessToken();
        throw new ApiClientError('This account is suspended.', 403, 'ACCOUNT_SUSPENDED');
      }
      setError(null);
      setSession(authenticatedSession);
      setStatus('authenticated');
      queryClient.clear();
      router.replace(safeReturnPath(returnTo));
    },
    [client, queryClient, router],
  );

  const logout = useCallback(async () => {
    try {
      await client.logout();
    } finally {
      setSession(null);
      setError(null);
      setStatus('anonymous');
      queryClient.clear();
      router.replace('/login');
    }
  }, [client, queryClient, router]);

  const logoutAll = useCallback(async () => {
    try {
      await client.logoutAll();
    } finally {
      setSession(null);
      setError(null);
      setStatus('anonymous');
      queryClient.clear();
      router.replace('/login');
    }
  }, [client, queryClient, router]);

  const refreshProfile = useCallback(async () => {
    const refreshed = await client.me();
    setSession(refreshed);
    setStatus('authenticated');
  }, [client]);

  const switchMembership = useCallback(
    async (membershipId: string) => {
      const switched = await client.switchMembership(membershipId);
      queryClient.clear();
      setSession(switched);
    },
    [client, queryClient],
  );

  const startSupportElevation = useCallback(
    async (input: StartSupportElevationInput) => {
      const elevated = await client.startSupportElevation(input);
      queryClient.clear();
      setSession(elevated);
    },
    [client, queryClient],
  );

  const endSupportElevation = useCallback(async () => {
    const restored = await client.endSupportElevation();
    queryClient.clear();
    setSession(restored);
  }, [client, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      api: client,
      endSupportElevation,
      error,
      listSessions: () => client.listSessions(),
      login,
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
    }),
    [
      client,
      endSupportElevation,
      error,
      initialize,
      login,
      logout,
      logoutAll,
      refreshProfile,
      session,
      startSupportElevation,
      status,
      switchMembership,
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
