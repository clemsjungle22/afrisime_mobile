import { DeliveryOptions } from '@afrisime/shared';
import { z } from 'zod';
import { getDeliveryOptions } from '@/server/checkout/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

const Params = z.object({ addressId: z.string().min(1).optional() });

/** Livraison (zone, frais, créneaux), retrait en agence et moyens de paiement possibles. */
export const GET = route({ auth: 'required', query: Params, response: DeliveryOptions }, ({ auth, query }) =>
  getDeliveryOptions(getDb(), auth.customer, query.addressId ?? null),
);
