import {
  type AddListItemBody,
  type CartLine,
  type CreateListBody,
  type FavoriteList,
  MAX_FAVORITES,
  MAX_LINE_QUANTITY,
  MAX_LISTS,
  MAX_LIST_ITEMS,
  type ShoppingList,
  type ShoppingListIndex,
  addToListLines,
  findVariant,
  resolveFavorites,
  resolveList,
} from '@afrisime/shared';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { getCatalog } from '../catalog/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';

/**
 * Favoris et listes d'achats du client connecté. Les prix et la disponibilité sont relus au catalogue
 * (segment du client) à chaque lecture : une liste ne fige jamais un prix.
 */

type Customer = { id: string; segment: string };
type ListRow = typeof s.shoppingLists.$inferSelect;

const invalid = (message: string) => new ApiError('VALIDATION_ERROR', message, undefined, 422);
const listNotFound = () => new ApiError('NOT_FOUND', 'Liste introuvable.');

// ─── Favoris ─────────────────────────────────────────────────────────────────

export async function listFavorites(db: Db, customer: Customer): Promise<FavoriteList> {
  const [rows, catalog] = await Promise.all([
    db
      .select({ productId: s.favorites.productId })
      .from(s.favorites)
      .where(eq(s.favorites.customerId, customer.id))
      .orderBy(desc(s.favorites.createdAt)),
    getCatalog(customer.segment),
  ]);
  return resolveFavorites(
    rows.map((r) => r.productId),
    catalog.products,
  );
}

/** Ajouter un favori (sans effet s'il y est déjà : réessayable). */
export async function addFavorite(
  db: Db,
  customer: Customer,
  productId: string,
): Promise<FavoriteList> {
  const catalog = await getCatalog(customer.segment);
  if (!catalog.products.some((p) => p.id === productId))
    throw new ApiError('NOT_FOUND', 'Produit introuvable.');
  const [taken] = await db
    .select({ n: count() })
    .from(s.favorites)
    .where(eq(s.favorites.customerId, customer.id));
  if ((taken?.n ?? 0) >= MAX_FAVORITES)
    throw invalid(`${MAX_FAVORITES} favoris au maximum : retirez-en avant d’en ajouter.`);
  await db.insert(s.favorites).values({ customerId: customer.id, productId }).onConflictDoNothing();
  return listFavorites(db, customer);
}

export async function removeFavorite(
  db: Db,
  customer: Customer,
  productId: string,
): Promise<FavoriteList> {
  await db
    .delete(s.favorites)
    .where(and(eq(s.favorites.customerId, customer.id), eq(s.favorites.productId, productId)));
  return listFavorites(db, customer);
}

// ─── Listes ──────────────────────────────────────────────────────────────────

const linesOf = (row: ListRow) => row.lines as CartLine[];

export async function listLists(db: Db, customerId: string): Promise<ShoppingListIndex> {
  const rows = await db
    .select()
    .from(s.shoppingLists)
    .where(eq(s.shoppingLists.customerId, customerId))
    .orderBy(desc(s.shoppingLists.updatedAt));
  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      itemCount: linesOf(r).length,
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}

async function ownList(db: Db, customerId: string, listId: string): Promise<ListRow> {
  const [row] = await db
    .select()
    .from(s.shoppingLists)
    .where(and(eq(s.shoppingLists.id, listId), eq(s.shoppingLists.customerId, customerId)));
  if (!row) throw listNotFound();
  return row;
}

async function present(customer: Customer, row: ListRow): Promise<ShoppingList> {
  const catalog = await getCatalog(customer.segment);
  return resolveList(
    { id: row.id, name: row.name, updatedAt: row.updatedAt.toISOString(), lines: linesOf(row) },
    { products: catalog.products, stock: catalog.stockLimits },
  );
}

export async function getList(db: Db, customer: Customer, listId: string): Promise<ShoppingList> {
  return present(customer, await ownList(db, customer.id, listId));
}

/** Formats encore au catalogue, une ligne par format, quantités plafonnées. */
async function cleanLines(customer: Customer, lines: readonly CartLine[]): Promise<CartLine[]> {
  const catalog = await getCatalog(customer.segment);
  let out: CartLine[] = [];
  for (const l of lines) {
    if (!findVariant(catalog.products, l.variantId)) continue;
    out = addToListLines(out, l, MAX_LINE_QUANTITY);
  }
  return out.slice(0, MAX_LIST_ITEMS);
}

export async function createList(
  db: Db,
  customer: Customer,
  body: CreateListBody,
): Promise<ShoppingList> {
  const [taken] = await db
    .select({ n: count() })
    .from(s.shoppingLists)
    .where(eq(s.shoppingLists.customerId, customer.id));
  if ((taken?.n ?? 0) >= MAX_LISTS)
    throw invalid(`${MAX_LISTS} listes au maximum : supprimez-en une avant d’en créer.`);

  let source: CartLine[] = body.lines ?? [];
  if (body.fromOrderId) {
    const [order] = await db
      .select({ id: s.orders.id })
      .from(s.orders)
      .where(and(eq(s.orders.id, body.fromOrderId), eq(s.orders.customerId, customer.id)));
    if (!order) throw new ApiError('NOT_FOUND', 'Commande introuvable.');
    const orderLines = await db
      .select({ variantId: s.orderLines.variantId, quantity: s.orderLines.quantity })
      .from(s.orderLines)
      .where(eq(s.orderLines.orderId, order.id))
      .orderBy(asc(s.orderLines.sortOrder));
    source = [...source, ...orderLines.filter((l) => l.quantity > 0)];
  }

  const now = new Date();
  const [row] = await db
    .insert(s.shoppingLists)
    .values({
      id: newId('lst'),
      customerId: customer.id,
      name: body.name,
      lines: await cleanLines(customer, source),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return present(customer, row!);
}

async function update(db: Db, customer: Customer, row: ListRow, changes: Partial<ListRow>) {
  const [updated] = await db
    .update(s.shoppingLists)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(s.shoppingLists.id, row.id))
    .returning();
  return present(customer, updated!);
}

export async function renameList(db: Db, customer: Customer, listId: string, name: string) {
  return update(db, customer, await ownList(db, customer.id, listId), { name });
}

export async function deleteList(db: Db, customer: Customer, listId: string) {
  await ownList(db, customer.id, listId);
  await db.delete(s.shoppingLists).where(eq(s.shoppingLists.id, listId));
  return listLists(db, customer.id);
}

/** Ajouter un format (quantité cumulée s'il y est déjà). */
export async function addListItem(
  db: Db,
  customer: Customer,
  listId: string,
  item: AddListItemBody,
): Promise<ShoppingList> {
  const row = await ownList(db, customer.id, listId);
  const catalog = await getCatalog(customer.segment);
  if (!findVariant(catalog.products, item.variantId))
    throw new ApiError('NOT_FOUND', 'Produit introuvable.');
  const lines = linesOf(row);
  if (!lines.some((l) => l.variantId === item.variantId) && lines.length >= MAX_LIST_ITEMS)
    throw invalid(`${MAX_LIST_ITEMS} produits au maximum par liste.`);
  return update(db, customer, row, { lines: addToListLines(lines, item, MAX_LINE_QUANTITY) });
}

/** Quantité exacte d'un format de la liste. */
export async function setListItem(
  db: Db,
  customer: Customer,
  listId: string,
  variantId: string,
  quantity: number,
): Promise<ShoppingList> {
  const row = await ownList(db, customer.id, listId);
  const lines = linesOf(row);
  if (!lines.some((l) => l.variantId === variantId))
    throw new ApiError('NOT_FOUND', 'Ce produit n’est pas dans la liste.');
  return update(db, customer, row, {
    lines: lines.map((l) => (l.variantId === variantId ? { ...l, quantity } : l)),
  });
}

export async function removeListItem(
  db: Db,
  customer: Customer,
  listId: string,
  variantId: string,
): Promise<ShoppingList> {
  const row = await ownList(db, customer.id, listId);
  return update(db, customer, row, {
    lines: linesOf(row).filter((l) => l.variantId !== variantId),
  });
}
