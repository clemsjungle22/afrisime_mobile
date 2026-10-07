// Configuration ESLint (flat config) — règles officielles Expo + règles du projet.
const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Code mort : imports et variables inutilisés (les « _ » volontaires sont tolérés).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // Idiome zod : un schéma et son type portent le même nom (`export const X = z…; export type X = …`).
      '@typescript-eslint/no-redeclare': 'off',
      // Ne jamais loguer en production (données personnelles, jetons) : console.warn/error tolérés.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Les fabriques de jest.mock() doivent utiliser require() (elles sont remontées avant les imports).
    files: ['jest.setup.ts', '**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
