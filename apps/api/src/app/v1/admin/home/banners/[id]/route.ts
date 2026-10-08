import { AdminBannerInput, AdminHome } from '@afrisime/shared';
import { deleteBanner, updateBanner } from '@/server/admin/home';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';
import { CATALOG_EDIT_ROLES } from '@/server/admin/catalog';

export const PATCH = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminBannerInput, response: AdminHome },
  (ctx) => updateBanner(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);

export const DELETE = adminRoute({ roles: CATALOG_EDIT_ROLES, response: AdminHome }, (ctx) =>
  deleteBanner(getDb(), ctx, ctx.params.id ?? ''),
);
