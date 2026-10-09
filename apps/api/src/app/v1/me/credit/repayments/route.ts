import { CreditAccount, RepayBody } from '@afrisime/shared';
import { repay } from '@/server/credit/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { idempotencyKey } from '@/server/idempotency';

/** Rembourser par Mobile Money (Idempotency-Key obligatoire : jamais deux débits). */
export const POST = route(
  { auth: 'required', body: RepayBody, response: CreditAccount, status: 201 },
  ({ auth, body, req }) => repay(getDb(), auth.customer, body, idempotencyKey(req)),
);
