import { AdminPack } from '@afrisime/shared';
import { z } from 'zod';
import { PACK_EDIT_ROLES, setPackImage } from '@/server/admin/packs';
import { adminRoute } from '@/server/admin/route';
import { uploadedFile } from '@/server/admin/upload';
import { getDb } from '@/server/db/client';

/** Photo du pack (formulaire multipart, champ « file »). */
export const POST = adminRoute(
  { roles: PACK_EDIT_ROLES, response: z.array(AdminPack) },
  async (ctx) => setPackImage(getDb(), ctx, ctx.params.id ?? '', await uploadedFile(ctx.req)),
);

export const DELETE = adminRoute({ roles: PACK_EDIT_ROLES, response: z.array(AdminPack) }, (ctx) =>
  setPackImage(getDb(), ctx, ctx.params.id ?? '', null),
);
