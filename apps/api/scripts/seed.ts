import './load-env';
import { createPostgresDb } from '../src/server/db/client';
import { seedDatabase } from '../src/server/db/seed';
import { env } from '../src/server/env';

/** Remplit la base avec les données d'exemple. Rejouable sans doublon. */
async function main() {
  if (env().NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== '1') {
    throw new Error('Refusé en production (données d’exemple). Forcer avec ALLOW_DEMO_SEED=1 si c’est voulu.');
  }
  const { db, close } = createPostgresDb(env().DATABASE_URL, { max: 1 });
  try {
    const counts = await seedDatabase(db);
    console.warn('✔ Données d’exemple chargées :', counts);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error('✘ Échec du seed :', error instanceof Error ? error.message : error);
  process.exit(1);
});
