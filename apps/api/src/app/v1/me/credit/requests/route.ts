import { CreditAccount, CreditRequestBody } from '@afrisime/shared';
import { requestCredit } from '@/server/credit/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Demander un crédit (comptes pros validés) : examinée par l'équipe. */
export const POST = route(
  { auth: 'required', body: CreditRequestBody, response: CreditAccount, status: 201 },
  ({ auth, body }) => requestCredit(getDb(), auth.customer, body),
);
