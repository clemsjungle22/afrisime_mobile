import { AdminProductDetail, AdminThresholdBody } from '@afrisime/shared';
import { CATALOG_EDIT_ROLES, setThreshold } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

/** Seuil d'alerte de stock d'une agence (tableau de bord). */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminThresholdBody, response: AdminProductDetail },
  (ctx) =>
    setThreshold(getDb(), ctx, ctx.params.id ?? '', ctx.body.agencyId, ctx.body.lowThreshold),
);
