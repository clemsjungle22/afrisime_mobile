import { AdminSession, AdminTotpBody } from '@afrisime/shared';
import { verifyLoginTotp } from '@/server/admin/auth';
import { clientOf } from '@/server/admin/client';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Code de l'application d'authentification, pendant la connexion. */
export const POST = route({ body: AdminTotpBody, response: AdminSession }, ({ req, body }) =>
  verifyLoginTotp(getDb(), body, clientOf(req)),
);
