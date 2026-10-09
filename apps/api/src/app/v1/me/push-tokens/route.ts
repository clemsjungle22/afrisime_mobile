import { PushTokenBody } from '@afrisime/shared';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { registerPushToken, unregisterPushToken } from '@/server/notifications/push';

const Ok = z.object({ ok: z.literal(true) });

/** Inscrit le téléphone aux notifications push (au démarrage de l'app, une fois connecté). */
export const POST = route(
  { auth: 'required', body: PushTokenBody, response: Ok },
  async ({ auth, body }) => {
    await registerPushToken(getDb(), auth.customer.id, body.token, body.platform);
    return { ok: true as const };
  },
);

/** Désinscrit le téléphone (déconnexion). */
export const DELETE = route(
  { auth: 'required', body: PushTokenBody, response: Ok },
  async ({ auth, body }) => {
    await unregisterPushToken(getDb(), auth.customer.id, body.token);
    return { ok: true as const };
  },
);
