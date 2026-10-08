import './load-env';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createPostgresDb } from '../src/server/db/client';
import { env } from '../src/server/env';

/** Applique les migrations SQL de ./drizzle (déjà appliquées = ignorées). */
async function main() {
  const { db, close } = createPostgresDb(env().DATABASE_URL, { max: 1 });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- le migrateur attend le type précis du pilote
    await migrate(db as any, { migrationsFolder: './drizzle' });
    console.warn('✔ Migrations appliquées.');
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error('✘ Échec des migrations :', error instanceof Error ? error.message : error);
  process.exit(1);
});
