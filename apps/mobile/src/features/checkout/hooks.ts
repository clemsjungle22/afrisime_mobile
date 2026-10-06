import type { AddressInput, CartValidateLine, Quote, QuoteRequest } from '@afrisime/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkoutApi } from './api';
import type { CheckoutSelection } from './selection';

export const checkoutKeys = {
  addresses: () => ['me', 'addresses'] as const,
  options: (addressId: string | null) => ['checkout', 'options', addressId] as const,
  quote: (body: QuoteRequest) => ['checkout', 'quote', body] as const,
};

export function useAddresses() {
  return useQuery({
    queryKey: checkoutKeys.addresses(),
    queryFn: ({ signal }) => checkoutApi.listAddresses(signal),
    staleTime: 5 * 60_000,
  });
}

export function useSaveAddress() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: AddressInput }) =>
      id ? checkoutApi.updateAddress(id, input) : checkoutApi.createAddress(input),
    onSuccess: () => client.invalidateQueries({ queryKey: checkoutKeys.addresses() }),
  });
}

/** Zones, frais, créneaux et moyens de paiement : rafraîchis souvent (les créneaux se remplissent). */
export function useDeliveryOptions(addressId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: checkoutKeys.options(addressId),
    queryFn: ({ signal }) => checkoutApi.getDeliveryOptions(addressId, signal),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Corps du devis si la sélection est complète, sinon null. */
export function toQuoteRequest(selection: CheckoutSelection, lines: CartValidateLine[]): QuoteRequest | null {
  const { fulfillment, addressId, agencyId, slotId, paymentMethod } = selection;
  if (!slotId || !paymentMethod || lines.length === 0) return null;
  if (fulfillment === 'delivery' && !addressId) return null;
  if (fulfillment === 'pickup' && !agencyId) return null;
  return {
    fulfillment,
    addressId: fulfillment === 'delivery' ? addressId : null,
    agencyId: fulfillment === 'pickup' ? agencyId : null,
    slotId,
    paymentMethod,
    useCredit: false,
    lines,
  };
}

/** Délai avant de redemander un devis : juste avant son expiration. */
export function msUntilRefresh(quote: Quote | undefined, now = Date.now()): number | false {
  if (!quote) return false;
  return Math.max(1_000, Date.parse(quote.expiresAt) - now - 30_000);
}

/**
 * Devis serveur (RB-002) : recalculé à chaque changement de choix, renouvelé automatiquement
 * avant expiration. Jamais persisté : un devis périmé ne doit pas être réaffiché.
 */
export function useQuote(body: QuoteRequest | null) {
  return useQuery({
    queryKey: body ? checkoutKeys.quote(body) : ['checkout', 'quote', 'incomplete'],
    queryFn: ({ signal }) => checkoutApi.quote(body!, signal),
    enabled: body !== null,
    staleTime: 0,
    gcTime: 60_000,
    retry: false,
    refetchInterval: (query) => msUntilRefresh(query.state.data),
  });
}
