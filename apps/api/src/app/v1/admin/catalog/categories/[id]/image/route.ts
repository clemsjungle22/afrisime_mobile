import { AdminCategory } from '@afrisime/shared';
import { z } from 'zod';
import { CATALOG_EDIT_ROLES, setCategoryImage } from '@/server/admin/catalog';
import { adminRoute } from '@/server/admin/route';
import { uploadedFile } from '@/server/admin/upload';
import { getDb } from '@/server/db/client';

const List = z.array(AdminCategory);

/** Photo du rayon (formulaire multipart, champ « file »). */
export const POST = adminRoute({ roles: CATALOG_EDIT_ROLES, response: List }, async (ctx) =>
  setCategoryImage(getDb(), ctx, ctx.params.id ?? '', await uploadedFile(ctx.req)),
);

/** Retire la photo : l'app revient à la couleur du rayon. */
export const DELETE = adminRoute({ roles: CATALOG_EDIT_ROLES, response: List }, (ctx) =>
  setCategoryImage(getDb(), ctx, ctx.params.id ?? '', null),
);
