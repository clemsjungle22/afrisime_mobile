import { AdminBannerMoveBody, AdminHome } from '@afrisime/shared';
import { moveBanner } from '@/server/admin/home';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';
import { CATALOG_EDIT_ROLES } from '@/server/admin/catalog';

/** Monter ou descendre une carte dans l'ordre de défilement. */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminBannerMoveBody, response: AdminHome },
  (ctx) => moveBanner(getDb(), ctx, ctx.params.id ?? '', ctx.body.direction),
);
