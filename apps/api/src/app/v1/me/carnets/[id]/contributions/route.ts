import { Carnet, ContributeBody } from '@afrisime/shared';
import { contribute } from '@/server/carnets/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { idempotencyKey } from '@/server/idempotency';

/** Cotiser par Mobile Money (Idempotency-Key obligatoire : jamais deux débits). */
export const POST = route(
  { auth: 'required', body: ContributeBody, response: Carnet, status: 201 },
  ({ auth, body, params, req }) =>
    contribute(getDb(), auth.customer, params.id ?? '', body, idempotencyKey(req)),
);
