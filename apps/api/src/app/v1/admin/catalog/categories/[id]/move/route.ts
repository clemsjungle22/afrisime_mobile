import { AdminCategory, AdminCategoryMoveBody } from '@afrisime/shared';
import { z } from 'zod';
import { CATALOG_EDIT_ROLES, moveCategory } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

/** Monter ou descendre un rayon dans l'ordre d'affichage. */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminCategoryMoveBody, response: z.array(AdminCategory) },
  (ctx) => moveCategory(getDb(), ctx, ctx.params.id ?? '', ctx.body.direction),
);
