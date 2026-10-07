import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { ApiError } from '@/server/http/errors';
import { route } from '@/server/http/route';
import { log } from '@/server/log';

export const dynamic = 'force-dynamic';

const HealthResponse = z.object({
  status: z.literal('ok'),
  database: z.literal('ok'),
  latencyMs: z.number().int().nonnegative(),
  time: z.string(),
});

/** Sonde de santé : le serveur répond ET la base est joignable (pour l'hébergeur et la supervision). */
export const GET = route({ response: HealthResponse }, async () => {
  const started = performance.now();
  try {
    await getDb().execute(sql`select 1`);
  } catch (error) {
    log.error('base de données injoignable', { error });
    throw new ApiError('INTERNAL_ERROR', 'Base de données injoignable.', undefined, 503);
  }
  return {
    status: 'ok' as const,
    database: 'ok' as const,
    latencyMs: Math.round(performance.now() - started),
    time: new Date().toISOString(),
  };
});
