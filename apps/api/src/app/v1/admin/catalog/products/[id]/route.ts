import { AdminProductDetail, AdminProductInput } from '@afrisime/shared';
import {
  CATALOG_EDIT_ROLES,
  CATALOG_VIEW_ROLES,
  getProduct,
  updateProduct,
} from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

export const GET = adminRoute(
  { roles: CATALOG_VIEW_ROLES, response: AdminProductDetail },
  ({ params }) => getProduct(getDb(), params.id ?? ''),
);

export const PATCH = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminProductInput, response: AdminProductDetail },
  (ctx) => updateProduct(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
