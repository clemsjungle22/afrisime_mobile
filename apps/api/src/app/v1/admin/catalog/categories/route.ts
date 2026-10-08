import { AdminCategory, AdminCategoryInput } from '@afrisime/shared';
import { z } from 'zod';
import {
  CATALOG_EDIT_ROLES,
  CATALOG_VIEW_ROLES,
  createCategory,
  listCategories,
} from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

const List = z.array(AdminCategory);

export const GET = adminRoute({ roles: CATALOG_VIEW_ROLES, response: List }, () =>
  listCategories(getDb()),
);

/** Nouveau rayon (placé en dernier). */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminCategoryInput, response: List, status: 201 },
  (ctx) => createCategory(getDb(), ctx, ctx.body),
);
