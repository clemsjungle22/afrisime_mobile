import { AdminPriceBody, AdminProductDetail } from '@afrisime/shared';
import { CATALOG_EDIT_ROLES, setPrice } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

/** Nouveau prix public ou pro, immédiat ou programmé (l'ancien reste dans l'historique). */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminPriceBody, response: AdminProductDetail, status: 201 },
  (ctx) => setPrice(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
