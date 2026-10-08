import { CreateOrderBody, Order, OrderList } from '@afrisime/shared';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { idempotencyKey } from '@/server/idempotency';
import { createOrder, listOrders } from '@/server/orders/service';

const Params = z.object({
  status: z.enum(['active', 'history']).default('active'),
  cursor: z.string().optional(),
});

export const GET = route(
  { auth: 'required', query: Params, response: OrderList },
  ({ auth, query }) => listOrders(getDb(), auth.customer.id, query.status, query.cursor),
);

/** Commande sur un devis (Idempotency-Key obligatoire : jamais de double commande). */
export const POST = route(
  { auth: 'required', body: CreateOrderBody, response: Order, status: 201 },
  ({ auth, body, req }) => createOrder(getDb(), auth.customer, body.quoteId, idempotencyKey(req)),
);
