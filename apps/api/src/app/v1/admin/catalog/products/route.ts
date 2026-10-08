import {
  AdminProductCreate,
  AdminProductDetail,
  AdminProductList,
  AdminProductListQuery,
} from '@afrisime/shared';
import {
  CATALOG_EDIT_ROLES,
  CATALOG_VIEW_ROLES,
  createProduct,
  listProducts,
} from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

export const GET = adminRoute(
  { roles: CATALOG_VIEW_ROLES, query: AdminProductListQuery, response: AdminProductList },
  ({ query }) => listProducts(getDb(), query),
);

/** Nouveau produit avec son premier format, son prix et son stock de départ. */
export const POST = adminRoute(
  {
    roles: CATALOG_EDIT_ROLES,
    body: AdminProductCreate,
    response: AdminProductDetail,
    status: 201,
  },
  (ctx) => createProduct(getDb(), ctx, ctx.body),
);
