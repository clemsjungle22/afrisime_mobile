import { AdminProductDetail, AdminPromoBody } from '@afrisime/shared';
import { CATALOG_EDIT_ROLES, createPromotion } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

/** Promotion datée sur le prix public (prix barré automatique). */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminPromoBody, response: AdminProductDetail, status: 201 },
  (ctx) => createPromotion(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
