// Stockage local simulé en mémoire pour les tests (recherches récentes, cache persistant).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Stockage chiffré simulé en mémoire (sessions).
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});

// Vrais UUID en test (le mock par défaut renvoie undefined : toutes les clés d'idempotence seraient égales).
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('crypto').randomUUID(),
}));

// Reanimated 4 : moteur de worklets simulé + utilitaires de test officiels (animations synchrones).
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();
