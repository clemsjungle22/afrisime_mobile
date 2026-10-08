import { AdminCollectBody, AdminOrderDetail } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { ORDER_ACT_ROLES, collectPayment } from '@/server/admin/orders';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Encaissement d'un paiement à la livraison ou en agence. */
export const POST = adminRoute(
  { roles: ORDER_ACT_ROLES, body: AdminCollectBody, response: AdminOrderDetail },
  (ctx) => collectPayment(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
