import {
  AddListItemBody,
  type CartLine,
  CreateListBody,
  FavoriteList,
  RenameListBody,
  SetListItemBody,
  ShoppingList,
  ShoppingListIndex,
} from '@afrisime/shared';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockListsApi } from '@/api/mock/lists';

/** Favoris et listes d'achats du client connecté (prix et stock relus par le serveur). */
export type ListsApi = {
  getFavorites(signal?: AbortSignal): Promise<FavoriteList>;
  addFavorite(productId: string): Promise<FavoriteList>;
  removeFavorite(productId: string): Promise<FavoriteList>;
  getLists(signal?: AbortSignal): Promise<ShoppingListIndex>;
  getList(listId: string, signal?: AbortSignal): Promise<ShoppingList>;
  createList(body: CreateListBody): Promise<ShoppingList>;
  renameList(listId: string, name: string): Promise<ShoppingList>;
  deleteList(listId: string): Promise<ShoppingListIndex>;
  addItem(listId: string, item: CartLine): Promise<ShoppingList>;
  setItem(listId: string, variantId: string, quantity: number): Promise<ShoppingList>;
  removeItem(listId: string, variantId: string): Promise<ShoppingList>;
};

const enc = encodeURIComponent;

const httpListsApi: ListsApi = {
  getFavorites(signal) {
    return request('/v1/me/favorites', { schema: FavoriteList, signal });
  },
  // Ajouter ou retirer deux fois donne le même état : réessayable.
  addFavorite(productId) {
    return request(`/v1/me/favorites/${enc(productId)}`, { method: 'PUT', schema: FavoriteList, safe: true });
  },
  removeFavorite(productId) {
    return request(`/v1/me/favorites/${enc(productId)}`, { method: 'DELETE', schema: FavoriteList, safe: true });
  },
  getLists(signal) {
    return request('/v1/me/lists', { schema: ShoppingListIndex, signal });
  },
  getList(listId, signal) {
    return request(`/v1/me/lists/${enc(listId)}`, { schema: ShoppingList, signal });
  },
  createList(body) {
    return request('/v1/me/lists', { method: 'POST', body: CreateListBody.parse(body), schema: ShoppingList });
  },
  renameList(listId, name) {
    return request(`/v1/me/lists/${enc(listId)}`, {
      method: 'PATCH',
      body: RenameListBody.parse({ name }),
      schema: ShoppingList,
      safe: true,
    });
  },
  deleteList(listId) {
    return request(`/v1/me/lists/${enc(listId)}`, { method: 'DELETE', schema: ShoppingListIndex });
  },
  // Ajout cumulatif : jamais rejoué automatiquement (la quantité doublerait).
  addItem(listId, item) {
    return request(`/v1/me/lists/${enc(listId)}/items`, {
      method: 'POST',
      body: AddListItemBody.parse(item),
      schema: ShoppingList,
    });
  },
  setItem(listId, variantId, quantity) {
    return request(`/v1/me/lists/${enc(listId)}/items/${enc(variantId)}`, {
      method: 'PATCH',
      body: SetListItemBody.parse({ quantity }),
      schema: ShoppingList,
      safe: true,
    });
  },
  removeItem(listId, variantId) {
    return request(`/v1/me/lists/${enc(listId)}/items/${enc(variantId)}`, {
      method: 'DELETE',
      schema: ShoppingList,
      safe: true,
    });
  },
};

export const listsApi: ListsApi = apiConfig.mock ? mockListsApi : httpListsApi;
