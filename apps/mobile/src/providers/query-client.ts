import { QueryClient } from '@tanstack/react-query';

export function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      mutations: {
        networkMode: 'online',
        retry: 0,
      },
      queries: {
        gcTime: 24 * 60 * 60 * 1_000,
        networkMode: 'offlineFirst',
        refetchOnReconnect: true,
        retry: 2,
        staleTime: 30_000,
      },
    },
  });
}
