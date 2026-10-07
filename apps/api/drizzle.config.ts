import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit ne sert qu'à GÉNÉRER les migrations SQL (npm run db:generate, sans connexion).
 * Elles sont appliquées par scripts/migrate.ts (Supabase) et par les tests (PGlite).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
});
