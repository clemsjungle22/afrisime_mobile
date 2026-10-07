import { existsSync } from 'node:fs';

/** Charge apps/api/.env.local (puis .env) comme le fait `next dev`, pour les scripts lancés avec tsx. */
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}
