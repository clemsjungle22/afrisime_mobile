import { AdminCategory, AdminCategoryInput } from '@afrisime/shared';
import { z } from 'zod';
import { CATALOG_EDIT_ROLES, updateCategory } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

/** Modifier un rayon (nom, description, couleur, actif). */
export const PATCH = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminCategoryInput, response: z.array(AdminCategory) },
  (ctx) => updateCategory(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
