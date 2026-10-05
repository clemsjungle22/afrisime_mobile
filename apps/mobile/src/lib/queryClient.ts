import { QueryClient } from '@tanstack/react-query';

/**
 * Les retries réseau sont gérés par la couche API (withRetry), qui distingue
 * lectures et écritures idempotentes : TanStack Query ne réessaie pas en plus.
 * Persistance hors-ligne (AsyncStorage) : à ajouter avec le catalogue.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
