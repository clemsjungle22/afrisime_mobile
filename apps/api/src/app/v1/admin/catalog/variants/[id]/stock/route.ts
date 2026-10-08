import { AdminProductDetail, AdminStockBody } from '@afrisime/shared';
import { CATALOG_EDIT_ROLES, moveStock } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

/** Mouvement de stock motivé (réception, inventaire, casse, retour, correction). */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminStockBody, response: AdminProductDetail },
  (ctx) => moveStock(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
