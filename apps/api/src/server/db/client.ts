import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

/** Base commune à PostgreSQL (Supabase, ou tout autre hébergeur) et à PGlite (tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db: Db | null; close: (() => Promise<void>) | null };
// Survit aux rechargements à chaud de `next dev` (sinon une connexion de plus à chaque sauvegarde).
const holder: Holder = ((globalThis as { __afrisimeDb?: Holder }).__afrisimeDb ??= { db: null, close: null });

/**
 * Connexion via le « Transaction pooler » de Supabase (port 6543) : `prepare: false` est obligatoire,
 * le pooler ne conserve pas les requêtes préparées d'une transaction à l'autre.
 */
export function createPostgresDb(url: string, options: { max?: number } = {}) {
  const sql = postgres(url, { prepare: false, max: options.max ?? 5, idle_timeout: 20, connect_timeout: 10 });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return { db: db as unknown as Db, close: () => sql.end({ timeout: 5 }) };
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
