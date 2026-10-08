import { AdminProductDetail } from '@afrisime/shared';
import { CATALOG_EDIT_ROLES, setProductImage } from '@/server/admin/catalog';
import { adminRoute } from '@/server/admin/route';
import { uploadedFile } from '@/server/admin/upload';
import { getDb } from '@/server/db/client';

/** Photo du produit (formulaire multipart, champ « file ») : recadrée et compressée par le serveur. */
export const POST = adminRoute(
  { roles: CATALOG_EDIT_ROLES, response: AdminProductDetail },
  async (ctx) => setProductImage(getDb(), ctx, ctx.params.id ?? '', await uploadedFile(ctx.req)),
);

/** Retire la photo : l'app revient aux initiales. */
export const DELETE = adminRoute(
  { roles: CATALOG_EDIT_ROLES, response: AdminProductDetail },
  (ctx) => setProductImage(getDb(), ctx, ctx.params.id ?? '', null),
);
