import { defineConfig } from 'eslint/config';
import nextTs from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'next-env.d.ts'] },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-redeclare': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
]);
