import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { HttpAuthTransport, currentDeviceSessionMetadata } from '../api/auth-transport';
import { mobileApiBaseUrl } from '../api/mobile-environment';
import { stopDeliveryLocationTracking } from '../platform/delivery-location';
import { stopTestRideLocationTracking } from '../platform/test-ride-location';
import { SecureStoreCredentialVault } from './credential-vault';
import { mobileGoogleAuthConfiguration } from './google-auth-environment';
import type { LoginInput, LogoutResult } from './auth-types';
import { MobileAuthManager } from './mobile-auth-manager';
import { NitroGoogleIdentityClient } from './nitro-google-identity-client';

export interface AuthActions {
  googleAvailable: boolean;
  login(input: LoginInput): Promise<void>;
  loginWithGoogle(): Promise<void>;
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

  const nativePlatform = Platform.OS === 'ios' ? 'ios' : 'android';
  const googleConfiguration = mobileGoogleAuthConfiguration(
    {
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      NODE_ENV: process.env.NODE_ENV,
    },
    nativePlatform,
  );
  const googleIdentity =
    googleConfiguration.available && googleConfiguration.webClientId
      ? new NitroGoogleIdentityClient({
          ...(googleConfiguration.iosClientId
            ? { iosClientId: googleConfiguration.iosClientId }
            : {}),
          webClientId: googleConfiguration.webClientId,
        })
      : undefined;

  return new MobileAuthManager({
    device: currentDeviceSessionMetadata(),
    ...(googleIdentity ? { googleIdentity } : {}),
    queryCache,
    stopActiveTestRideTracking: async () => {
      await Promise.all([stopTestRideLocationTracking(), stopDeliveryLocationTracking()]);
    },
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
      googleAvailable: manager.googleLoginAvailable,
      login: (input) => manager.login(input),
      loginWithGoogle: () => manager.loginWithGoogle(),
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
