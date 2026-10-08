import { AdminBannerInput, AdminHome } from '@afrisime/shared';
import { createBanner } from '@/server/admin/home';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';
import { CATALOG_EDIT_ROLES } from '@/server/admin/catalog';

/** Nouvelle carte défilante (placée en dernier). */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminBannerInput, response: AdminHome, status: 201 },
  (ctx) => createBanner(getDb(), ctx, ctx.body),
);
