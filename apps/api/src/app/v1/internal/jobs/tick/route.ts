import { z } from 'zod';
import { safeEqual } from '@/server/auth/tokens';
import { getDb } from '@/server/db/client';
import { env } from '@/server/env';
import { ApiError } from '@/server/http/errors';
import { route } from '@/server/http/route';
import { tick } from '@/server/jobs';

const Result = z.object({
  paymentsChecked: z.number(),
  contributionsChecked: z.number(),
  carnetsClosed: z.number(),
  ordersExpired: z.number(),
  ordersAdvanced: z.number(),
});

/** Appelée chaque minute par le planificateur de l'hébergeur (en-tête Authorization: Bearer CRON_SECRET). */
export const POST = route({ response: Result }, ({ req }) => {
  const secret = env().CRON_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  // Sans secret configuré ou avec un mauvais secret, la route se comporte comme si elle n'existait pas.
  if (!secret || !safeEqual(given, secret)) throw new ApiError('NOT_FOUND', 'Introuvable.');
  return tick(getDb());
});
