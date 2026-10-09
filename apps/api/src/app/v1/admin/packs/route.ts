import { AdminPack, AdminPackInput } from '@afrisime/shared';
import { z } from 'zod';
import { PACK_EDIT_ROLES, PACK_VIEW_ROLES, listAdminPacks, savePack } from '@/server/admin/packs';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

export const GET = adminRoute({ roles: PACK_VIEW_ROLES, response: z.array(AdminPack) }, () =>
  listAdminPacks(getDb()),
);

/** Nouveau pack (contenu, prix, durée de cotisation). */
export const POST = adminRoute(
  { roles: PACK_EDIT_ROLES, body: AdminPackInput, response: z.array(AdminPack), status: 201 },
  (ctx) => savePack(getDb(), ctx, null, ctx.body),
);
