import { AdminProductDetail, AdminVariantInput } from '@afrisime/shared';
import { CATALOG_EDIT_ROLES, updateVariant } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

export const PATCH = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminVariantInput, response: AdminProductDetail },
  (ctx) => updateVariant(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
