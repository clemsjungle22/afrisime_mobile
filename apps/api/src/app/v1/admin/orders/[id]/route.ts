import { AdminOrderDetail } from '@afrisime/shared';
import { ORDER_VIEW_ROLES, getAdminOrder } from '@/server/admin/orders';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Fiche commande : articles, client, réception, paiements, suivi, notes et actions possibles. */
export const GET = adminRoute(
  { roles: ORDER_VIEW_ROLES, response: AdminOrderDetail },
  ({ params, admin }) => getAdminOrder(getDb(), params.id ?? '', admin.role),
);
