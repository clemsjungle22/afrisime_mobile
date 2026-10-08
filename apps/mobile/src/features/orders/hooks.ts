import { FINAL_ORDER_STATUSES, type Order } from '@afrisime/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { newIdempotencyKey } from '@/api/client';
import { useCart } from '@/features/cart/store';
import { ordersApi, type OrderFilter } from './api';

export const ordersKeys = {
  all: ['orders'] as const,
  list: (filter: OrderFilter) => [...ordersKeys.all, 'list', filter] as const,
  detail: (id: string) => [...ordersKeys.all, 'detail', id] as const,
  payment: (id: string) => ['payments', id] as const,
};

/**
 * Une commande non terminée évolue (préparation, livraison) : rafraîchie régulièrement à l'écran,
 * et dès le retour dans l'app. Les notifications push prendront le relais plus tard.
 */
const ACTIVE_ORDER_POLL_MS = 10_000;
const ACTIVE_LIST_POLL_MS = 30_000;

export function useOrders(filter: OrderFilter) {
  const query = useInfiniteQuery({
    queryKey: ordersKeys.list(filter),
    queryFn: ({ pageParam, signal }) =>
      ordersApi.listOrders(filter, pageParam ?? undefined, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Commandes en cours : leur étape change ; l'historique, lui, ne bouge plus.
    refetchInterval: filter === 'active' ? ACTIVE_LIST_POLL_MS : false,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  return { ...query, items };
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ordersKeys.detail(orderId),
    queryFn: ({ signal }) => ordersApi.getOrder(orderId, signal),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) =>
      q.state.data && !FINAL_ORDER_STATUSES.has(q.state.data.status) ? ACTIVE_ORDER_POLL_MS : false,
  });
}

/** Clé d'idempotence par devis : la même pour toutes les tentatives de création de CETTE commande. */
const orderKeysByQuote = new Map<string, string>();

export function orderIdempotencyKey(quoteId: string): string {
  let key = orderKeysByQuote.get(quoteId);
  if (!key) {
    key = newIdempotencyKey();
    orderKeysByQuote.set(quoteId, key);
  }
  return key;
}

/**
 * Création de commande (RB-003) : un double tap n'envoie qu'une requête, et toute nouvelle
 * tentative (réseau coupé, bouton « Réessayer ») réutilise la même Idempotency-Key.
 * Le panier n'est vidé qu'une fois la commande créée par le serveur.
 */
export function usePlaceOrder() {
  const client = useQueryClient();
  const clearCart = useCart((s) => s.clear);
  const inFlight = useRef(false);

  const mutation = useMutation({
    mutationFn: (quoteId: string) => ordersApi.createOrder(quoteId, orderIdempotencyKey(quoteId)),
    onSuccess: (order: Order) => {
      clearCart();
      client.setQueryData(ordersKeys.detail(order.id), order);
      void client.invalidateQueries({ queryKey: ordersKeys.all });
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const place = (quoteId: string): Promise<Order> | null => {
    if (inFlight.current) return null;
    inFlight.current = true;
    return mutation.mutateAsync(quoteId);
  };

  return { place, isPending: mutation.isPending, error: mutation.error, reset: mutation.reset };
}

export function useCancelOrder(orderId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => ordersApi.cancelOrder(orderId),
    onSuccess: (order) => {
      client.setQueryData(ordersKeys.detail(order.id), order);
      void client.invalidateQueries({ queryKey: [...ordersKeys.all, 'list'] });
    },
  });
}

export function useReorder(orderId: string) {
  const addValidated = useCart((s) => s.addValidated);
  return useMutation({
    mutationFn: async () => {
      const res = await ordersApi.reorder(orderId);
      return {
        added: addValidated(res.lines),
        unavailable: res.lines.filter((l) => l.status === 'unavailable').length,
      };
    },
  });
}
