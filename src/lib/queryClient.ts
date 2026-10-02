import { QueryCache, QueryClient, MutationCache } from '@tanstack/react-query';
import { handleUnauthorized, isUnauthorizedError } from './auth/unauthorizedHandler';

/**
 * Global QueryClient instance with production-grade defaults:
 * - Automatic 401 interception: refresh token once, retry once, otherwise sign out (Cases C3, C4)
 * - staleTime: 30s to minimize unnecessary network traffic
 * - retry: 1 retry for network/server glitches, 0 retries for 4xx client errors
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: async (error, query) => {
      if (isUnauthorizedError(error)) {
        const refreshed = await handleUnauthorized();
        if (refreshed) {
          query.fetch();
        }
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: async (error) => {
      if (isUnauthorizedError(error)) {
        await handleUnauthorized();
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: (failureCount, error: unknown) => {
        if (typeof error === 'object' && error !== null) {
          const err = error as { status?: number; statusCode?: number };
          const status = err.status ?? err.statusCode;
          // No retry for client errors (4xx)
          if (status && status >= 400 && status < 500) {
            return false;
          }
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
