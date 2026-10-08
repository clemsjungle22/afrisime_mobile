import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';
import * as schema from './schema';

/** Base commune à PostgreSQL (Supabase, ou tout autre hébergeur) et à PGlite (tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db: Db | null; close: (() => Promise<void>) | null };
// Survit aux rechargements à chaud de `next dev` (sinon une connexion de plus à chaque sauvegarde).
const holder: Holder = ((globalThis as { __afrisimeDb?: Holder }).__afrisimeDb ??= { db: null, close: null });

/**
 * Connexion via le « Transaction pooler » de Supabase (port 6543), avec le pilote `pg` :
 * une seule requête à la fois par connexion, et pas de requêtes préparées nommées.
 * (Le pilote `postgres` enchaîne plusieurs requêtes sur une connexion sans attendre les réponses,
 * ce que le pooler en mode transaction ne supporte pas : requêtes bloquées puis « statement timeout ».)
 */
export function createPostgresDb(url: string, options: { max?: number } = {}) {
  const pool = new Pool({
    connectionString: url,
    max: options.max ?? 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle(pool, { schema, casing: 'snake_case' });
  return { db: db as unknown as Db, close: () => pool.end() };
}

export function getDb(): Db {
  if (!holder.db) {
    const { db, close } = createPostgresDb(env().DATABASE_URL);
    holder.db = db;
    holder.close = close;
  }
  return holder.db;
}

/** Tests : remplace la base (PGlite en mémoire). */
export function setDb(db: Db | null) {
  holder.db = db;
  holder.close = null;
}

export async function closeDb() {
  await holder.close?.();
  holder.db = null;
  holder.close = null;
}

export { schema };
