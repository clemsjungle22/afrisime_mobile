import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { cartApi } from './api';
import { toValidateRequest, useCart } from './store';

export const cartKeys = {
  validate: (body: unknown) => ['cart', 'validate', body] as const,
};

/**
 * Revalidation serveur du panier (RB-002) : à l'affichage du panier, après chaque
 * modification (débouncée) et à la demande avant « Passer la commande ».
 * Jamais persistée : un total serveur périmé ne doit pas être réaffiché.
 */
export function useCartValidation() {
  const lines = useCart((s) => s.lines);
  const body = useMemo(() => toValidateRequest(lines), [lines]);
  const debounced = useDebouncedValue(body, 400);
  const settled = debounced === body;

  const query = useQuery({
    queryKey: cartKeys.validate(debounced),
    queryFn: ({ signal }) => cartApi.validate(debounced, signal),
    enabled: debounced.lines.length > 0,
    staleTime: 0,
    gcTime: 60_000,
    placeholderData: keepPreviousData,
  });

  // Revalide à chaque RETOUR sur l'écran Panier (le 1er affichage déclenche déjà la requête).
  const { refetch } = query;
  const focusedOnce = useRef(false);
  const hasLines = body.lines.length > 0;
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current && hasLines) void refetch();
      focusedOnce.current = true;
    }, [refetch, hasLines]),
  );

  /** Les totaux affichés correspondent-ils exactement au panier actuel ? */
  const isCurrent = settled && !query.isPlaceholderData && query.isSuccess && !query.isFetching;

  return { ...query, isCurrent };
}
