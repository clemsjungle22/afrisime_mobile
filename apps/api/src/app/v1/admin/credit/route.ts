import { AdminCreditList, AdminCreditListQuery } from '@afrisime/shared';
import { CREDIT_VIEW_ROLES, listAdminCredit } from '@/server/admin/credit';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Crédits des clientes (demandes, ouverts, en retard, suspendus), avec recherche et compteurs. */
export const GET = adminRoute(
  { roles: CREDIT_VIEW_ROLES, query: AdminCreditListQuery, response: AdminCreditList },
  ({ query }) => listAdminCredit(getDb(), query),
);
