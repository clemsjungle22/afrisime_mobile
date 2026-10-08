import { AdminLoginBody, AdminLoginResponse } from '@afrisime/shared';
import { login } from '@/server/admin/auth';
import { clientOf } from '@/server/admin/client';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Connexion de l'équipe : session ouverte, ou étape 2FA à franchir. */
export const POST = route({ body: AdminLoginBody, response: AdminLoginResponse }, ({ req, body }) =>
  login(getDb(), body, clientOf(req)),
);
