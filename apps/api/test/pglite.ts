import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import type { Db } from '@/server/db/client';
import * as schema from '@/server/db/schema';

/** Vraie base PostgreSQL en mémoire (PGlite), avec les MÊMES migrations que Supabase. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '../drizzle') });
  return { db: db as unknown as Db, client, close: () => client.close() };
}
