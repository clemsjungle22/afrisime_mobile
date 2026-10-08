import { AdminBlockBody, AdminCustomerDetail } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { CUSTOMER_BLOCK_ROLES, setBlocked } from '@/server/admin/customers';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Bloquer un compte (motif obligatoire) : déconnecté de tous ses appareils, connexion refusée. */
export const POST = adminRoute(
  { roles: CUSTOMER_BLOCK_ROLES, body: AdminBlockBody, response: AdminCustomerDetail },
  (ctx) => setBlocked(getDb(), ctx, ctx.params.id ?? '', true, ctx.body, clientOf(ctx.req).ip),
);
