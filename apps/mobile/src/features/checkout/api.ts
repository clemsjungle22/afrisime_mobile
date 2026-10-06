import {
  Address,
  AddressInput,
  AddressList,
  DeliveryOptions,
  Quote,
  QuoteRequest,
} from '@afrisime/shared';
import { z } from 'zod';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockCheckoutApi } from '@/api/mock/checkout';

export type CheckoutApi = {
  listAddresses(signal?: AbortSignal): Promise<Address[]>;
  createAddress(input: AddressInput): Promise<Address>;
  updateAddress(id: string, input: AddressInput): Promise<Address>;
  deleteAddress(id: string): Promise<void>;
  getDeliveryOptions(addressId: string | null, signal?: AbortSignal): Promise<DeliveryOptions>;
  /** Devis final signé. Sans effet de bord (aucune commande créée) : réessayable. */
  quote(body: QuoteRequest, signal?: AbortSignal): Promise<Quote>;
};

const httpCheckoutApi: CheckoutApi = {
  listAddresses(signal) {
    return request('/v1/me/addresses', { schema: AddressList, signal });
  },
  createAddress(input) {
    // Pas d'Idempotency-Key au contrat : pas de nouvelle tentative automatique (éviter un doublon).
    return request('/v1/me/addresses', { method: 'POST', body: AddressInput.parse(input), schema: Address });
  },
  updateAddress(id, input) {
    return request(`/v1/me/addresses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: AddressInput.parse(input),
      schema: Address,
      safe: true,
    });
  },
  async deleteAddress(id) {
    await request(`/v1/me/addresses/${encodeURIComponent(id)}`, { method: 'DELETE', schema: z.unknown(), safe: true });
  },
  getDeliveryOptions(addressId, signal) {
    return request('/v1/delivery/options', { query: { addressId }, schema: DeliveryOptions, signal });
  },
  quote(body, signal) {
    return request('/v1/checkout/quote', {
      method: 'POST',
      body: QuoteRequest.parse(body),
      schema: Quote,
      safe: true,
      signal,
    });
  },
};

export const checkoutApi: CheckoutApi = apiConfig.mock ? mockCheckoutApi : httpCheckoutApi;
