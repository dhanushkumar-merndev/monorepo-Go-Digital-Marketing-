import { QueryClient } from '@tanstack/react-query';

import { ApiResponseError } from '../api/api-error';

function retryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiResponseError && error.status >= 400 && error.status < 500) {
    return false;
  }

  return failureCount < 2;
}

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
        retry: retryQuery,
        staleTime: 30_000,
      },
    },
  });
}

export { retryQuery };
