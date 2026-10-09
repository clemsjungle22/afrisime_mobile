import { mockProducts, mockStock } from '@afrisime/fixtures';
import {
  type CartLine,
  FavoriteList,
  MAX_FAVORITES,
  MAX_LINE_QUANTITY,
  MAX_LIST_ITEMS,
  MAX_LISTS,
  ShoppingList,
  ShoppingListIndex,
  addToListLines,
  findVariant,
  resolveFavorites,
  resolveList,
} from '@afrisime/shared';
import type { ListsApi } from '@/features/lists/api';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { type MockList, loadDb, saveDb } from './db';
import { mockError, simulate } from './simulate';

/** Favoris et listes du mode démo : mêmes règles que le serveur (logique partagée). */

const read = <T>(run: () => Promise<T>, signal?: AbortSignal) => withRetry(run, { canRetry: true, signal });
const write = <T>(run: () => Promise<T>) => withRetry(run, { canRetry: false });
const catalog = { products: mockProducts, stock: mockStock };

const invalid = (message: string) => mockError('VALIDATION_ERROR', message, 422);
const notFound = (message = 'Liste introuvable.') => mockError('NOT_FOUND', message, 404);

async function favorites(userId: string) {
  const db = await loadDb();
  return resolveFavorites(db.favorites[userId] ?? [], mockProducts);
}

const present = (l: MockList) => resolveList(l, catalog);

/** Lecture et écriture des listes du client connecté. */
async function withLists<T>(token: string | null, run: (lists: MockList[]) => T | Promise<T>, save = false) {
  const user = await requireUser(token);
  const db = await loadDb();
  const lists = db.lists[user.id] ?? [];
  const result = await run(lists);
  if (save) await saveDb({ ...db, lists: { ...db.lists, [user.id]: lists } });
  return result;
}

function find(lists: MockList[], listId: string) {
  const list = lists.find((l) => l.id === listId);
  if (!list) throw notFound();
  return list;
}

function touch(list: MockList, lines: CartLine[]) {
  list.lines = lines;
  list.updatedAt = new Date().toISOString();
}

const clean = (lines: readonly CartLine[]) =>
  lines
    .filter((l) => findVariant(mockProducts, l.variantId))
    .reduce<CartLine[]>((acc, l) => addToListLines(acc, l, MAX_LINE_QUANTITY), [])
    .slice(0, MAX_LIST_ITEMS);

export const mockListsApi: ListsApi = {
  getFavorites(signal) {
    return read(
      () => withAuth((token) => simulate(FavoriteList, async () => favorites((await requireUser(token)).id))),
      signal,
    );
  },
  addFavorite(productId) {
    return read(() =>
      withAuth((token) =>
        simulate(FavoriteList, async () => {
          const user = await requireUser(token);
          if (!mockProducts.some((p) => p.id === productId)) throw notFound('Produit introuvable.');
          const db = await loadDb();
          const current = db.favorites[user.id] ?? [];
          if (!current.includes(productId)) {
            if (current.length >= MAX_FAVORITES) throw invalid(`${MAX_FAVORITES} favoris au maximum.`);
            await saveDb({ ...db, favorites: { ...db.favorites, [user.id]: [productId, ...current] } });
          }
          return favorites(user.id);
        }),
      ),
    );
  },
  removeFavorite(productId) {
    return read(() =>
      withAuth((token) =>
        simulate(FavoriteList, async () => {
          const user = await requireUser(token);
          const db = await loadDb();
          const next = (db.favorites[user.id] ?? []).filter((id) => id !== productId);
          await saveDb({ ...db, favorites: { ...db.favorites, [user.id]: next } });
          return favorites(user.id);
        }),
      ),
    );
  },

  getLists(signal) {
    return read(
      () =>
        withAuth((token) =>
          simulate(ShoppingListIndex, () =>
            withLists(token, (lists) => ({
              items: [...lists]
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .map((l) => ({ id: l.id, name: l.name, itemCount: l.lines.length, updatedAt: l.updatedAt })),
            })),
          ),
        ),
      signal,
    );
  },
  getList(listId, signal) {
    return read(
      () => withAuth((token) => simulate(ShoppingList, () => withLists(token, (lists) => present(find(lists, listId))))),
      signal,
    );
  },
  createList(body) {
    return write(() =>
      withAuth((token) =>
        simulate(ShoppingList, async () => {
          const user = await requireUser(token);
          const db = await loadDb();
          let source = body.lines ?? [];
          if (body.fromOrderId) {
            const order = (db.orders[user.id] ?? []).find((o) => o.id === body.fromOrderId);
            if (!order) throw notFound('Commande introuvable.');
            source = [...source, ...order.lines.filter((l) => l.quantity > 0).map((l) => ({ variantId: l.variantId, quantity: l.quantity }))];
          }
          return withLists(
            token,
            (lists) => {
              if (lists.length >= MAX_LISTS) throw invalid(`${MAX_LISTS} listes au maximum : supprimez-en une avant d’en créer.`);
              const now = new Date().toISOString();
              const list: MockList = { id: `lst_${Date.now().toString(36)}`, name: body.name.trim(), lines: clean(source), updatedAt: now };
              lists.push(list);
              return present(list);
            },
            true,
          );
        }),
      ),
    );
  },
  renameList(listId, name) {
    return read(() =>
      withAuth((token) =>
        simulate(ShoppingList, () =>
          withLists(
            token,
            (lists) => {
              const list = find(lists, listId);
              list.name = name.trim();
              touch(list, list.lines);
              return present(list);
            },
            true,
          ),
        ),
      ),
    );
  },
  deleteList(listId) {
    return write(() =>
      withAuth((token) =>
        simulate(ShoppingListIndex, () =>
          withLists(
            token,
            (lists) => {
              const index = lists.findIndex((l) => l.id === listId);
              if (index < 0) throw notFound();
              lists.splice(index, 1);
              return { items: lists.map((l) => ({ id: l.id, name: l.name, itemCount: l.lines.length, updatedAt: l.updatedAt })) };
            },
            true,
          ),
        ),
      ),
    );
  },
  addItem(listId, item) {
    return write(() =>
      withAuth((token) =>
        simulate(ShoppingList, () =>
          withLists(
            token,
            (lists) => {
              const list = find(lists, listId);
              if (!findVariant(mockProducts, item.variantId)) throw notFound('Produit introuvable.');
              if (!list.lines.some((l) => l.variantId === item.variantId) && list.lines.length >= MAX_LIST_ITEMS) {
                throw invalid(`${MAX_LIST_ITEMS} produits au maximum par liste.`);
              }
              touch(list, addToListLines(list.lines, item, MAX_LINE_QUANTITY));
              return present(list);
            },
            true,
          ),
        ),
      ),
    );
  },
  setItem(listId, variantId, quantity) {
    return read(() =>
      withAuth((token) =>
        simulate(ShoppingList, () =>
          withLists(
            token,
            (lists) => {
              const list = find(lists, listId);
              if (!list.lines.some((l) => l.variantId === variantId)) throw notFound('Ce produit n’est pas dans la liste.');
              touch(list, list.lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)));
              return present(list);
            },
            true,
          ),
        ),
      ),
    );
  },
  removeItem(listId, variantId) {
    return read(() =>
      withAuth((token) =>
        simulate(ShoppingList, () =>
          withLists(
            token,
            (lists) => {
              const list = find(lists, listId);
              touch(list, list.lines.filter((l) => l.variantId !== variantId));
              return present(list);
            },
            true,
          ),
        ),
      ),
    );
  },
};
