import { AdminOrderDetail, AdminTransitionBody } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { ORDER_ACT_ROLES, transitionAdminOrder } from '@/server/admin/orders';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Fait franchir une étape (préparation, remise au livreur, livrée, retirée…). */
export const POST = adminRoute(
  { roles: ORDER_ACT_ROLES, body: AdminTransitionBody, response: AdminOrderDetail },
  (ctx) => transitionAdminOrder(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
