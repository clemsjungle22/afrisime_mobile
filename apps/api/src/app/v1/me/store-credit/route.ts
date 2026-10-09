import { StoreCredit } from '@afrisime/shared';
import { getStoreCredit } from '@/server/customers/storeCredit';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Avoir du client : solde et mouvements. */
export const GET = route({ auth: 'required', response: StoreCredit }, ({ auth }) =>
  getStoreCredit(getDb(), auth.customer.id),
);
