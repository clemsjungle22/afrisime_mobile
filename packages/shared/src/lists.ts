import { z } from 'zod';
import { CartLine, ValidatedCartLine } from './cart';
import { validateCart } from './cartEngine';
import { ProductSummary, type ProductDetail } from './catalog';
import { toSummary } from './catalogLogic';

/**
 * Favoris et listes d'achats récurrentes (/v1/me/favorites, /v1/me/lists).
 * Les prix et la disponibilité sont toujours ceux du moment (revalidés par le serveur).
 */

export const MAX_FAVORITES = 200;
export const MAX_LISTS = 20;
export const MAX_LIST_ITEMS = 100;

// ─── Favoris ─────────────────────────────────────────────────────────────────

export const FavoriteList = z.object({
  /** Produits favoris encore au catalogue, les plus récents d'abord. */
  items: z.array(ProductSummary),
});
export type FavoriteList = z.infer<typeof FavoriteList>;

// ─── Listes d'achats ─────────────────────────────────────────────────────────

const ListName = z.string().trim().min(1, 'Donnez un nom à la liste').max(60);

export const ShoppingListSummary = z.object({
  id: z.string(),
  name: z.string(),
  itemCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});
export type ShoppingListSummary = z.infer<typeof ShoppingListSummary>;

export const ShoppingListIndex = z.object({ items: z.array(ShoppingListSummary) });
export type ShoppingListIndex = z.infer<typeof ShoppingListIndex>;

export const ShoppingList = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.string().datetime(),
  /**
   * Produits de la liste au prix et au stock du moment ; `requestedQuantity` = quantité de la liste,
   * `quantity` = quantité disponible maintenant (ce qui ira au panier).
   */
  lines: z.array(ValidatedCartLine),
  /** Formats retirés du catalogue depuis l'ajout (ignorés). */
  missingCount: z.number().int().nonnegative(),
});
export type ShoppingList = z.infer<typeof ShoppingList>;

/** POST /v1/me/lists : liste vide, avec des produits, ou copie d'une commande passée. */
export const CreateListBody = z.object({
  name: ListName,
  lines: z.array(CartLine).max(MAX_LIST_ITEMS).optional(),
  fromOrderId: z.string().optional(),
});
export type CreateListBody = z.infer<typeof CreateListBody>;

export const RenameListBody = z.object({ name: ListName });
export type RenameListBody = z.infer<typeof RenameListBody>;

/** POST /v1/me/lists/{id}/items : ajoute la quantité (cumulée si le format y est déjà). */
export const AddListItemBody = CartLine;
export type AddListItemBody = z.infer<typeof AddListItemBody>;

/** PATCH /v1/me/lists/{id}/items/{variantId} : quantité exacte. */
export const SetListItemBody = z.object({ quantity: CartLine.shape.quantity });
export type SetListItemBody = z.infer<typeof SetListItemBody>;

// ─── Logique commune (serveur et mode démo) ──────────────────────────────────

/** Favoris → résumés produits (les produits retirés du catalogue disparaissent). */
export function resolveFavorites(
  productIds: readonly string[],
  products: ProductDetail[],
): FavoriteList {
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    items: productIds.flatMap((id) => {
      const p = byId.get(id);
      return p ? [toSummary(p)] : [];
    }),
  };
}

/** Lignes d'une liste revalidées au prix et au stock du moment. */
export function resolveList(
  list: { id: string; name: string; updatedAt: string; lines: readonly CartLine[] },
  catalog: { products: ProductDetail[]; stock: ReadonlyMap<string, number> },
): ShoppingList {
  const validated = validateCart(
    {
      lines: list.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
        expectedUnitPrice: null,
        expectedAvailability: 'available',
      })),
    },
    catalog,
  );
  return {
    id: list.id,
    name: list.name,
    updatedAt: list.updatedAt,
    // Une liste ne retient pas de prix : « prix changé » n'a pas de sens ici.
    lines: validated.lines.map((l) => (l.status === 'price_changed' ? { ...l, status: 'ok' as const } : l)),
    missingCount: validated.changes.filter((c) => c.type === 'removed').length,
  };
}

/** Ajout cumulatif d'un format dans une liste (une ligne par format, quantité plafonnée). */
export function addToListLines(lines: readonly CartLine[], item: CartLine, max = 999): CartLine[] {
  const existing = lines.find((l) => l.variantId === item.variantId);
  if (!existing) return [...lines, item];
  return lines.map((l) =>
    l.variantId === item.variantId
      ? { ...l, quantity: Math.min(max, l.quantity + item.quantity) }
      : l,
  );
}
