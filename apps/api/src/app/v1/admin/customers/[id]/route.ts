import { AdminCustomerDetail } from '@afrisime/shared';
import { CUSTOMER_VIEW_ROLES, getAdminCustomer } from '@/server/admin/customers';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Fiche client : coordonnées, adresses, commandes, historique et actions possibles. */
export const GET = adminRoute(
  { roles: CUSTOMER_VIEW_ROLES, response: AdminCustomerDetail },
  ({ params, admin }) => getAdminCustomer(getDb(), admin.role, params.id ?? ''),
);
