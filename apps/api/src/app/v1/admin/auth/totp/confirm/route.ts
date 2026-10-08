import { AdminSession, AdminTotpConfirmBody } from '@afrisime/shared';
import { confirmTotpSetup } from '@/server/admin/auth';
import { clientOf } from '@/server/admin/client';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Premier code : prouve que l'application est bien configurée, active le 2FA et ouvre la session. */
export const POST = route({ body: AdminTotpConfirmBody, response: AdminSession }, ({ req, body }) =>
  confirmTotpSetup(getDb(), body, clientOf(req)),
);
