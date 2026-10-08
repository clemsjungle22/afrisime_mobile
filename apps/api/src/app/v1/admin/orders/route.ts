import { AdminOrderList, AdminOrderListQuery } from '@afrisime/shared';
import { ORDER_VIEW_ROLES, listAdminOrders } from '@/server/admin/orders';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Commandes par onglet (étape), avec recherche, filtres et compteurs. */
export const GET = adminRoute(
  { roles: ORDER_VIEW_ROLES, query: AdminOrderListQuery, response: AdminOrderList },
  ({ query }) => listAdminOrders(getDb(), query),
);
