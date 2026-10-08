import { ServerCart, ServerCartPut } from '@afrisime/shared';
import { getCart, putCart } from '@/server/cart/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

export const GET = route({ auth: 'required', response: ServerCart }, ({ auth }) => getCart(getDb(), auth.customer.id));

/** Remplace le panier enregistré (idempotent). */
export const PUT = route({ auth: 'required', body: ServerCartPut, response: ServerCart }, ({ auth, body }) =>
  putCart(getDb(), auth.customer.id, body.lines),
);
