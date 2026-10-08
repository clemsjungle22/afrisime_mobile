import { z } from 'zod';
import { Availability, HexColor, MediaUrl } from './catalog';
import { Money } from './money';

/** Quantité maximale par ligne côté app (le serveur peut réduire selon le stock). */
export const MAX_LINE_QUANTITY = 999;

const Quantity = z.number().int().positive().max(MAX_LINE_QUANTITY);

/** Ligne de panier serveur : GET/PUT /v1/cart. */
export const CartLine = z.object({
  variantId: z.string(),
  quantity: Quantity,
});
export type CartLine = z.infer<typeof CartLine>;

/**
 * Ligne envoyée à POST /v1/cart/validate. Les valeurs « attendues » sont celles affichées
 * à l'utilisateur : le serveur s'en sert pour signaler précisément ce qui a changé (RB-002).
 */
export const CartValidateLine = CartLine.extend({
  expectedUnitPrice: Money.nullable(),
  expectedAvailability: Availability,
});
export type CartValidateLine = z.infer<typeof CartValidateLine>;

export const CartValidateRequest = z.object({
  lines: z.array(CartValidateLine).max(200),
});
export type CartValidateRequest = z.infer<typeof CartValidateRequest>;

export const CartLineStatus = z.enum(['ok', 'price_changed', 'quantity_reduced', 'unavailable']);
export type CartLineStatus = z.infer<typeof CartLineStatus>;

/** Ligne recalculée par le serveur : prix, quantité accordée et total qui font foi. */
export const ValidatedCartLine = z.object({
  variantId: z.string(),
  productSlug: z.string(),
  productName: z.string(),
  brand: z.string(),
  variantLabel: z.string(),
  imageUrl: MediaUrl.nullable(),
  color: HexColor,
  availability: Availability,
  leadTimeDays: z.number().int().nonnegative().nullable(),
  minQuantity: z.number().int().positive(),
  /** Stock restant si limité, null si non limité. */
  maxQuantity: z.number().int().nonnegative().nullable(),
  unitPrice: Money.nullable(),
  requestedQuantity: Quantity,
  /** Quantité accordée (≤ demandée). 0 si indisponible. */
  quantity: z.number().int().nonnegative(),
  lineTotal: Money,
  status: CartLineStatus,
});
export type ValidatedCartLine = z.infer<typeof ValidatedCartLine>;

export const CartChangeType = z.enum(['price_changed', 'quantity_reduced', 'unavailable', 'removed']);
export type CartChangeType = z.infer<typeof CartChangeType>;

/** Changement à expliquer à l'utilisateur (« Votre panier a changé »). */
export const CartChange = z.object({
  type: CartChangeType,
  variantId: z.string(),
  productName: z.string(),
  variantLabel: z.string(),
  oldPrice: Money.nullable(),
  newPrice: Money.nullable(),
  oldQuantity: z.number().int().nonnegative().nullable(),
  newQuantity: z.number().int().nonnegative().nullable(),
});
export type CartChange = z.infer<typeof CartChange>;

/** Réponse de POST /v1/cart/validate. Les totaux sont TOUJOURS ceux du serveur. */
export const ValidatedCart = z.object({
  lines: z.array(ValidatedCartLine),
  changes: z.array(CartChange),
  /** Somme des lignes disponibles. */
  subtotal: Money,
  discountTotal: Money,
  total: Money,
  /** Nombre d'articles (somme des quantités accordées). */
  itemCount: z.number().int().nonnegative(),
  currency: z.literal('XOF'),
  validatedAt: z.string().datetime(),
});
export type ValidatedCart = z.infer<typeof ValidatedCart>;

/** Panier serveur du client connecté : GET/PUT /v1/cart (PUT remplace tout, donc idempotent). */
export const ServerCart = z.object({
  lines: z.array(CartLine).max(200),
  updatedAt: z.string().datetime(),
});
export type ServerCart = z.infer<typeof ServerCart>;

export const ServerCartPut = z.object({
  lines: z.array(CartLine).max(200),
});
export type ServerCartPut = z.infer<typeof ServerCartPut>;
