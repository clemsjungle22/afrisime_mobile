import { AdminHome, AdminHomeSettingsBody } from '@afrisime/shared';
import { saveHomeSettings } from '@/server/admin/home';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';
import { CATALOG_EDIT_ROLES } from '@/server/admin/catalog';

/** Phrase d'accueil, textes et affichage des sections. */
export const PUT = adminRoute(
  { roles: CATALOG_EDIT_ROLES, body: AdminHomeSettingsBody, response: AdminHome },
  (ctx) => saveHomeSettings(getDb(), ctx, ctx.body),
);
