import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { ApiError } from '@/server/http/errors';
import { route } from '@/server/http/route';
import { handleWebhook } from '@/server/payments/service';

/** Confirmations envoyées par le prestataire de paiement : signature vérifiée, chaque événement traité une fois. */
export const POST = route({ response: z.object({ received: z.literal(true) }) }, async ({ req, params }) => {
  const raw = await req.text();
  const ok = await handleWebhook(getDb(), params.provider ?? '', raw, req.headers).catch(() => false);
  if (!ok) throw new ApiError('FORBIDDEN', 'Signature invalide.');
  return { received: true as const };
});
