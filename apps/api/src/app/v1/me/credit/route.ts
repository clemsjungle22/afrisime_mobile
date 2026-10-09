import { CreditAccount } from '@afrisime/shared';
import { getCreditAccount } from '@/server/credit/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Mon crédit : plafond, disponible, encours, dû du jour, dettes et remboursements. */
export const GET = route({ auth: 'required', response: CreditAccount }, ({ auth }) =>
  getCreditAccount(getDb(), auth.customer),
);
