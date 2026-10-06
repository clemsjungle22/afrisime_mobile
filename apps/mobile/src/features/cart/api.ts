import { CartValidateRequest, ValidatedCart } from '@afrisime/shared';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockCartApi } from '@/api/mock/cart';

/**
 * Contrat du panier côté app. La synchronisation du panier serveur (GET/PUT /v1/cart)
 * sera ajoutée avec la connexion (US-001) ; un visiteur n'a qu'un panier local.
 */
export type CartApi = {
  validate(body: CartValidateRequest, signal?: AbortSignal): Promise<ValidatedCart>;
};

const httpCartApi: CartApi = {
  validate(body, signal) {
    return request('/v1/cart/validate', {
      method: 'POST',
      body: CartValidateRequest.parse(body),
      schema: ValidatedCart,
      safe: true,
      signal,
    });
  },
};

export const cartApi: CartApi = apiConfig.mock ? mockCartApi : httpCartApi;
