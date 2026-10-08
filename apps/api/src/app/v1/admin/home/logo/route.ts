import { AdminHome } from '@afrisime/shared';
import { setLogo } from '@/server/admin/home';
import { uploadedFile } from '@/server/admin/upload';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';
import { CATALOG_EDIT_ROLES } from '@/server/admin/catalog';

/** Logo de l'en-tête de l'accueil (formulaire multipart, champ « file »). */
export const POST = adminRoute({ roles: CATALOG_EDIT_ROLES, response: AdminHome }, async (ctx) =>
  setLogo(getDb(), ctx, await uploadedFile(ctx.req)),
);

/** Retour au logo intégré à l'app. */
export const DELETE = adminRoute({ roles: CATALOG_EDIT_ROLES, response: AdminHome }, (ctx) =>
  setLogo(getDb(), ctx, null),
);
