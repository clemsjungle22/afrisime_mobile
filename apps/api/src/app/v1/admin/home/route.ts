import { AdminHome } from '@afrisime/shared';
import { getAdminHome } from '@/server/admin/home';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';
import { CATALOG_VIEW_ROLES } from '@/server/admin/catalog';

/** Accueil de l'app : cartes défilantes, textes, sections et logo. */
export const GET = adminRoute({ roles: CATALOG_VIEW_ROLES, response: AdminHome }, () =>
  getAdminHome(getDb()),
);
