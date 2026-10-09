import { Carnet, CarnetList, SubscribeBody } from '@afrisime/shared';
import { listCarnets, subscribe } from '@/server/carnets/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { idempotencyKey } from '@/server/idempotency';

/** Carnets du client : en cours d'abord. */
export const GET = route({ auth: 'required', response: CarnetList }, ({ auth }) =>
  listCarnets(getDb(), auth.customer),
);

/** Souscrire à un pack (Idempotency-Key obligatoire : jamais de double souscription). */
export const POST = route(
  { auth: 'required', body: SubscribeBody, response: Carnet, status: 201 },
  ({ auth, body, req }) => subscribe(getDb(), auth.customer, body.packId, idempotencyKey(req)),
);
