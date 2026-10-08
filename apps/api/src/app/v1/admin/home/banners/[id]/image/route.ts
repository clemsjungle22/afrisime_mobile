import { AdminHome } from '@afrisime/shared';
import { setBannerImage } from '@/server/admin/home';
import { uploadedFile } from '@/server/admin/upload';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';
import { CATALOG_EDIT_ROLES } from '@/server/admin/catalog';

/** Photo de la carte (formulaire multipart, champ « file ») : remplace le dessin. */
export const POST = adminRoute({ roles: CATALOG_EDIT_ROLES, response: AdminHome }, async (ctx) =>
  setBannerImage(getDb(), ctx, ctx.params.id ?? '', await uploadedFile(ctx.req)),
);

/** Retour au dessin du style. */
export const DELETE = adminRoute({ roles: CATALOG_EDIT_ROLES, response: AdminHome }, (ctx) =>
  setBannerImage(getDb(), ctx, ctx.params.id ?? '', null),
);
