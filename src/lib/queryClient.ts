import { QueryClient } from '@tanstack/react-query';

/**
 * Global QueryClient instance with production-grade defaults:
 * - staleTime: 30s to minimize unnecessary network traffic
 * - retry: 1 retry for network/server glitches, 0 retries for 4xx client errors
 */
export const queryClient = new QueryClient({
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
