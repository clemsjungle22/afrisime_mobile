// Stockage local simulé en mémoire pour les tests (recherches récentes, cache persistant).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
