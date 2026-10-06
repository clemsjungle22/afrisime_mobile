import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';

const DAY_MS = 24 * 60 * 60_000;

/**
 * Les retries réseau sont gérés par la couche API (withRetry), qui distingue
 * lectures et écritures idempotentes : TanStack Query ne réessaie pas en plus.
 * gcTime aligné sur la durée de persistance, sinon le cache restauré serait purgé.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: DAY_MS,
      refetchOnWindowFocus: false,
      // Hors ligne : on affiche le cache au lieu de mettre la requête en pause indéfiniment.
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: false,
    },
  },
});

/** Seules les données publiques de lecture (catalogue) sont persistées sur le téléphone. */
const PERSISTED_ROOTS = new Set(['catalog']);

function shouldPersist(query: Query): boolean {
  const root = query.queryKey[0];
  return query.state.status === 'success' && typeof root === 'string' && PERSISTED_ROOTS.has(root);
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({
    storage: AsyncStorage,
    key: 'afrisime-query-cache',
    throttleTime: 2000,
  }),
  maxAge: DAY_MS,
  // Invalide le cache persistant à chaque nouvelle version de l'app (contrat potentiellement changé).
  buster: Constants.expoConfig?.version ?? 'dev',
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
};
