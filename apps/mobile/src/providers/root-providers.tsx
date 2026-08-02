import { QueryClientProvider } from '@tanstack/react-query';
import { SQLiteProvider } from 'expo-sqlite';
import { type ReactNode, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MOBILE_DATABASE_NAME, migrateLocalDatabase } from '../data/local-database';
import { AppErrorBoundary } from '../observability/app-error-boundary';
import { useConnectivity } from '../platform/connectivity';
import { useNotificationBootstrap } from '../platform/use-notification-bootstrap';
import { createMobileQueryClient } from './query-client';
import { AuthProvider } from '../auth/auth-provider';

interface RootProvidersProps {
  children: ReactNode;
}

function PlatformBootstrap(): null {
  useConnectivity();
  useNotificationBootstrap();
  return null;
}

export function RootProviders({ children }: RootProvidersProps) {
  const [queryClient] = useState(createMobileQueryClient);

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SQLiteProvider databaseName={MOBILE_DATABASE_NAME} onInit={migrateLocalDatabase}>
              <PlatformBootstrap />
              {children}
            </SQLiteProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
