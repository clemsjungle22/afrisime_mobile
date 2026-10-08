import { AdminNewVariant, AdminProductDetail } from '@afrisime/shared';
import { CATALOG_EDIT_ROLES, addVariant } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

/** Nouveau format (prix public et stock de départ). */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminNewVariant, response: AdminProductDetail, status: 201 },
  (ctx) => addVariant(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
