import { PaymentIntent } from '@afrisime/shared';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { getPayment } from '@/server/payments/service';

/** Suivi d'un paiement : l'app interroge cette adresse pendant que le client confirme sur son téléphone. */
export const GET = route({ auth: 'required', response: PaymentIntent }, ({ auth, params }) =>
  getPayment(getDb(), auth.customer.id, params.id ?? ''),
);
