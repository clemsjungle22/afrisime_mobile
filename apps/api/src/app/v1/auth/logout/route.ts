import { z } from 'zod';
import { revokeSession } from '@/server/auth/sessions';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Ferme la session de cet appareil (les autres appareils restent connectés). */
export const POST = route({ auth: 'required', response: z.null(), status: 204 }, async ({ auth }) => {
  await revokeSession(getDb(), auth.sessionId);
  return null;
});
