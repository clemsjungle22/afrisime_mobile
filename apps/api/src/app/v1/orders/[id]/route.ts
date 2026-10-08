import { Order } from '@afrisime/shared';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { getOrder } from '@/server/orders/service';

export const GET = route({ auth: 'required', response: Order }, ({ auth, params }) =>
  getOrder(getDb(), auth.customer.id, params.id ?? ''),
);
