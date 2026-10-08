import { defineConfig } from 'eslint/config';
import nextTs from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'drizzle/**', 'next-env.d.ts'] },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // Idiome zod : un schéma et son type portent le même nom.
      '@typescript-eslint/no-redeclare': 'off',
      // Journaux structurés uniquement (src/server/log.ts) : jamais de console.log brut.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Scripts en ligne de commande (migrations, seed, e2e) : la sortie console est leur résultat.
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },
]);
