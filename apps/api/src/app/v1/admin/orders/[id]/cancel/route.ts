import { AdminCancelBody, AdminOrderDetail } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { ORDER_ACT_ROLES, cancelByAdmin } from '@/server/admin/orders';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Annulation par l'équipe (motif obligatoire) : stock libéré, remboursement si déjà payée. */
export const POST = adminRoute(
  { roles: ORDER_ACT_ROLES, body: AdminCancelBody, response: AdminOrderDetail },
  (ctx) => cancelByAdmin(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
