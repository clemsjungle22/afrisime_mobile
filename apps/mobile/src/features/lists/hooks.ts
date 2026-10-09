import type {
  CartLine,
  CreateListBody,
  FavoriteList,
  ProductSummary,
  ShoppingList,
  ShoppingListIndex,
} from '@afrisime/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSession } from '@/features/auth/session';
import { useCart } from '@/features/cart/store';
import { listsApi } from './api';

export const listsKeys = {
  favorites: ['favorites'] as const,
  lists: ['lists'] as const,
  list: (id: string) => ['lists', 'detail', id] as const,
};

const useAuthenticated = () => useSession((s) => s.status === 'authenticated');

// ─── Favoris ─────────────────────────────────────────────────────────────────

/** Favoris du client connecté (jamais persistés sur le téléphone : données du compte). */
export function useFavorites() {
  const authenticated = useAuthenticated();
  return useQuery({
    queryKey: listsKeys.favorites,
    queryFn: ({ signal }) => listsApi.getFavorites(signal),
    enabled: authenticated,
    staleTime: 60_000,
  });
}

/** Identifiants des produits favoris (cœur plein sur les cartes). */
export function useFavoriteIds(): ReadonlySet<string> {
  const { data } = useFavorites();
  return useMemo(() => new Set(data?.items.map((p) => p.id) ?? []), [data]);
}

/**
 * Ajouter / retirer un favori : le cœur change tout de suite (optimiste), puis la réponse du serveur
 * fait foi ; en cas d'échec, l'état précédent est rétabli.
 */
export function useToggleFavorite() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ product, on }: { product: ProductSummary; on: boolean }) =>
      on ? listsApi.addFavorite(product.id) : listsApi.removeFavorite(product.id),
    onMutate: async ({ product, on }) => {
      await client.cancelQueries({ queryKey: listsKeys.favorites });
      const previous = client.getQueryData<FavoriteList>(listsKeys.favorites);
      const items = (previous?.items ?? []).filter((p) => p.id !== product.id);
      client.setQueryData<FavoriteList>(listsKeys.favorites, { items: on ? [product, ...items] : items });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(listsKeys.favorites, context.previous);
    },
    onSuccess: (list) => client.setQueryData(listsKeys.favorites, list),
  });
}

// ─── Listes d'achats ─────────────────────────────────────────────────────────

export function useLists() {
  const authenticated = useAuthenticated();
  return useQuery({
    queryKey: listsKeys.lists,
    queryFn: ({ signal }) => listsApi.getLists(signal),
    enabled: authenticated,
    staleTime: 30_000,
  });
}

/** Liste au prix et au stock du moment (relue souvent : les prix changent). */
export function useList(listId: string) {
  return useQuery({
    queryKey: listsKeys.list(listId),
    queryFn: ({ signal }) => listsApi.getList(listId, signal),
    staleTime: 15_000,
  });
}

/** Liste modifiée : détail mis à jour, index (noms, nombres de produits) relu. */
function useListWrite<V>(call: (vars: V) => Promise<ShoppingList>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: (list) => {
      client.setQueryData(listsKeys.list(list.id), list);
      void client.invalidateQueries({ queryKey: listsKeys.lists, exact: true });
    },
  });
}

export const useCreateList = () => useListWrite((body: CreateListBody) => listsApi.createList(body));

export const useRenameList = (listId: string) =>
  useListWrite((name: string) => listsApi.renameList(listId, name));

export const useAddToList = () =>
  useListWrite(({ listId, item }: { listId: string; item: CartLine }) => listsApi.addItem(listId, item));

export const useSetListItem = (listId: string) =>
  useListWrite(({ variantId, quantity }: { variantId: string; quantity: number }) =>
    listsApi.setItem(listId, variantId, quantity),
  );

export const useRemoveListItem = (listId: string) =>
  useListWrite((variantId: string) => listsApi.removeItem(listId, variantId));

export function useDeleteList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => listsApi.deleteList(listId),
    onSuccess: (index: ShoppingListIndex, listId) => {
      client.setQueryData(listsKeys.lists, index);
      client.removeQueries({ queryKey: listsKeys.list(listId) });
    },
  });
}

/**
 * « Tout mettre au panier » : la liste est relue (prix et stock du moment), puis les produits
 * disponibles vont au panier. Le résultat dit ce qui a été ajouté, réduit ou laissé de côté.
 */
export function useListToCart(listId: string) {
  const client = useQueryClient();
  const addValidated = useCart((s) => s.addValidated);
  return useMutation({
    mutationFn: async () => {
      const list = await listsApi.getList(listId);
      client.setQueryData(listsKeys.list(list.id), list);
      return {
        added: addValidated(list.lines),
        unavailable: list.lines.filter((l) => l.status === 'unavailable').length + list.missingCount,
        reduced: list.lines.filter((l) => l.status !== 'unavailable' && l.quantity < l.requestedQuantity).length,
      };
    },
  });
}
