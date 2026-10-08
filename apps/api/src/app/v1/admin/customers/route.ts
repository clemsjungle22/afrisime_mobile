import { AdminCustomerList, AdminCustomerListQuery } from '@afrisime/shared';
import { CUSTOMER_VIEW_ROLES, listAdminCustomers } from '@/server/admin/customers';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Clients par filtre (pros à valider, tarif, bloqués), avec recherche et compteurs. */
export const GET = adminRoute(
  { roles: CUSTOMER_VIEW_ROLES, query: AdminCustomerListQuery, response: AdminCustomerList },
  ({ query }) => listAdminCustomers(getDb(), query),
);
