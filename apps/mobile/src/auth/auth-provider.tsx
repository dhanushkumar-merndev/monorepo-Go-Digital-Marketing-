import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { HttpAuthTransport, currentDeviceSessionMetadata } from '../api/auth-transport';
import { mobileApiBaseUrl } from '../api/mobile-environment';
import { SecureStoreCredentialVault } from './credential-vault';
import type { LoginInput, LogoutResult } from './auth-types';
import { MobileAuthManager } from './mobile-auth-manager';

export interface AuthActions {
  login(input: LoginInput): Promise<void>;
  logout(): Promise<LogoutResult>;
  request(path: string, init?: RequestInit): Promise<Response>;
  resetForAnotherAccount(): Promise<void>;
  retrySession(): Promise<void>;
}

const AuthContext = createContext<AuthActions | null>(null);

export interface AuthProviderProps {
  children: ReactNode;
}

function createAuthManager(queryCache: ReturnType<typeof useQueryClient>): MobileAuthManager {
  const baseUrl = mobileApiBaseUrl({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    NODE_ENV: process.env.NODE_ENV,
  });

  return new MobileAuthManager({
    device: currentDeviceSessionMetadata(),
    queryCache,
    transport: new HttpAuthTransport(baseUrl),
    vault: new SecureStoreCredentialVault(),
  });
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [manager] = useState(() => createAuthManager(queryClient));

  useEffect(() => {
    void manager.bootstrap();
  }, [manager]);

  const actions = useMemo<AuthActions>(
    () => ({
      login: (input) => manager.login(input),
      logout: () => manager.logout(),
      request: (path, init) => manager.request(path, init),
      resetForAnotherAccount: () => manager.resetForAnotherAccount(),
      retrySession: () => manager.retrySession(),
    }),
    [manager],
  );

  return <AuthContext.Provider value={actions}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthActions {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}

export { AuthContext };
