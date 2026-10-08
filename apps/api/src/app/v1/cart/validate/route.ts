import { CartValidateRequest, ValidatedCart } from '@afrisime/shared';
import { validate } from '@/server/cart/service';
import { segmentOf } from '@/server/catalog/service';
import { route } from '@/server/http/route';

/** Revérifie le panier (prix, stock, disponibilité) et liste ce qui a changé. Ouvert aux visiteurs. */
export const POST = route({ auth: 'optional', body: CartValidateRequest, response: ValidatedCart }, ({ auth, body }) =>
  validate(body, segmentOf(auth)),
);
