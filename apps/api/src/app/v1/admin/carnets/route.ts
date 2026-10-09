import { AdminCarnetList, AdminCarnetListQuery } from '@afrisime/shared';
import { CARNET_VIEW_ROLES, listAdminCarnets } from '@/server/admin/packs';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Carnets des clients (en cours, en retard, soldés…), avec recherche et compteurs. */
export const GET = adminRoute(
  { roles: CARNET_VIEW_ROLES, query: AdminCarnetListQuery, response: AdminCarnetList },
  ({ query }) => listAdminCarnets(getDb(), query),
);
