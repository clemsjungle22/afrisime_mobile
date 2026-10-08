import { MAX_LINE_QUANTITY, type CartLine, type CartValidateRequest, type ServerCart, type ValidatedCart, validateCart } from '@afrisime/shared';
import { eq, sql } from 'drizzle-orm';
import { getCatalog } from '../catalog/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';

/**
 * Revalidation du panier au prix et au stock du moment, pour le segment du client
 * (prix pro si son compte est validé, prix public sinon ou s'il n'est pas connecté).
 */
export async function validate(request: CartValidateRequest, segment = 'retail'): Promise<ValidatedCart> {
  const catalog = await getCatalog(segment);
  return validateCart(request, { products: catalog.products, stock: catalog.stockLimits });
}

/** Panier enregistré (retrouvé sur un autre appareil). Vide s'il n'existe pas encore. */
export async function getCart(db: Db, customerId: string): Promise<ServerCart> {
  const [row] = await db.select().from(s.carts).where(eq(s.carts.customerId, customerId));
  return row ? { lines: row.lines as CartLine[], updatedAt: row.updatedAt.toISOString() } : { lines: [], updatedAt: new Date().toISOString() };
}

/** Remplace le panier en entier (PUT : rejouer la même requête donne le même résultat). */
export async function putCart(db: Db, customerId: string, lines: CartLine[]): Promise<ServerCart> {
  // Une ligne par format : les doublons éventuels sont fusionnés.
  const merged = new Map<string, number>();
  for (const l of lines) merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.quantity);
  const clean = [...merged].map(([variantId, quantity]) => ({ variantId, quantity: Math.min(quantity, MAX_LINE_QUANTITY) }));
  const now = new Date();
  await db
    .insert(s.carts)
    .values({ customerId, lines: clean, updatedAt: now })
    .onConflictDoUpdate({
      target: s.carts.customerId,
      set: { lines: clean, version: sql`${s.carts.version} + 1`, updatedAt: now },
    });
  return { lines: clean, updatedAt: now.toISOString() };
}
