import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Chaque fichier crée sa propre base PGlite : exécution parallèle sans interférence.
    testTimeout: 30_000,
    // Démarrage + migrations de plusieurs bases PGlite en parallèle : plus long que les 10 s par défaut.
    hookTimeout: 60_000,
    // Configuration fictive : les tests n'utilisent jamais .env.local ni la base Supabase.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test@localhost:5432/inutilisee',
      AUTH_SECRET: 'secret-de-test-uniquement-0123456789abcdefghij',
      LOG_LEVEL: 'error',
      SMS_PROVIDER: 'console',
      OTP_DEV_CODE: '',
    },
  },
});
