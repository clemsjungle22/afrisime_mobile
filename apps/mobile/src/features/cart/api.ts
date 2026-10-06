import {
  CartValidateRequest,
  ServerCart,
  ServerCartPut,
  ValidatedCart,
  type CartLine,
} from '@afrisime/shared';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockCartApi } from '@/api/mock/cart';

/**
 * Contrat du panier côté app. Un visiteur n'a qu'un panier local ; une fois connecté,
 * le panier est fusionné puis synchronisé avec le panier serveur (GET/PUT /v1/cart).
 */
export type CartApi = {
  validate(body: CartValidateRequest, signal?: AbortSignal): Promise<ValidatedCart>;
  getServerCart(signal?: AbortSignal): Promise<ServerCart>;
  /** Remplace entièrement le panier serveur (idempotent). */
  putServerCart(lines: CartLine[]): Promise<ServerCart>;
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
  getServerCart(signal) {
    return request('/v1/cart', { schema: ServerCart, signal });
  },
  putServerCart(lines) {
    return request('/v1/cart', {
      method: 'PUT',
      body: ServerCartPut.parse({ lines }),
      schema: ServerCart,
      safe: true,
    });
  },
};

export const cartApi: CartApi = apiConfig.mock ? mockCartApi : httpCartApi;
