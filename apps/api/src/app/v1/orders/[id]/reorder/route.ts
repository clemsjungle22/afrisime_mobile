import { ReorderResponse } from '@afrisime/shared';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { reorder } from '@/server/orders/service';

/** Articles d'une ancienne commande, aux prix et au stock du jour. */
export const POST = route({ auth: 'required', response: ReorderResponse }, ({ auth, params }) =>
  reorder(getDb(), auth.customer, params.id ?? ''),
);
