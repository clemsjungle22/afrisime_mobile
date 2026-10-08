import { CancelOrderBody, Order } from '@afrisime/shared';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { cancelOrder } from '@/server/orders/service';

/** Annulation tant que la préparation n'a pas commencé ; remboursement si la commande était payée. */
export const POST = route(
  { auth: 'required', body: CancelOrderBody, response: Order },
  ({ auth, params, body }) => cancelOrder(getDb(), auth.customer.id, params.id ?? '', body.reason),
);
