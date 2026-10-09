import { AdminPack, AdminPackInput } from '@afrisime/shared';
import { z } from 'zod';
import { PACK_EDIT_ROLES, savePack } from '@/server/admin/packs';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Modifier un pack (les carnets déjà ouverts gardent leur contenu et leur prix). */
export const PATCH = adminRoute(
  { roles: PACK_EDIT_ROLES, body: AdminPackInput, response: z.array(AdminPack) },
  (ctx) => savePack(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
