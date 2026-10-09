import { Order, RedeemBody } from '@afrisime/shared';
import { redeemCarnet } from '@/server/carnets/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { idempotencyKey } from '@/server/idempotency';

/** Recevoir le pack soldé (Idempotency-Key obligatoire : une seule commande par carnet). */
export const POST = route(
  { auth: 'required', body: RedeemBody, response: Order, status: 201 },
  ({ auth, body, params, req }) =>
    redeemCarnet(getDb(), auth.customer, params.id ?? '', body, idempotencyKey(req)),
);
