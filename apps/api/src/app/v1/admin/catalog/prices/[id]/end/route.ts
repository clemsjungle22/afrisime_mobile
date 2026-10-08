import { AdminProductDetail } from '@afrisime/shared';
import { CATALOG_EDIT_ROLES, endPrice } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

/** Arrêter une promotion ou un prix (un prix programmé est annulé). */
export const POST = adminRoute({ roles: CATALOG_EDIT_ROLES, response: AdminProductDetail }, (ctx) =>
  endPrice(getDb(), ctx, Number(ctx.params.id)),
);
