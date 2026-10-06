import type {
  CartChange,
  CartValidateRequest,
  ProductDetail,
  ValidatedCart,
  ValidatedCartLine,
  Variant,
} from '@afrisime/shared';
import { noOverrides, type CatalogOverrides } from './scenarios';

/**
 * Revalidation SIMULÉE du panier (POST /v1/cart/validate), comme le ferait le serveur :
 * prix et stock courants, quantités accordées, totaux entiers, liste des changements.
 */

type Options = {
  products: ProductDetail[];
  stock: ReadonlyMap<string, number>;
  /** Modifications simulées (scénario de test) appliquées par-dessus le catalogue. */
  overrides?: CatalogOverrides;
  now?: Date;
};

/** Arrondi commercial aux 25 FCFA (montants entiers). */
function roundPrice(n: number): number {
  return Math.round(n / 25) * 25;
}

function findVariant(products: ProductDetail[], variantId: string) {
  for (const product of products) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

function isSellable(v: Variant): boolean {
  return (v.availability === 'available' || v.availability === 'on_order') && v.price !== null;
}

/**
 * Scénario « panier modifié » : à partir du panier courant, +10 % sur la 1re ligne,
 * stock réduit d'une unité sur la 2e, rupture sur la 3e.
 */
export function buildCartChangeOverrides(request: CartValidateRequest, products: ProductDetail[]): CatalogOverrides {
  const prices = new Map<string, number>();
  const stock = new Map<string, number>();
  const unavailable = new Set<string>();
  request.lines.forEach((line, index) => {
    const variant = findVariant(products, line.variantId)?.variant;
    if (!variant) return;
    if (index === 0 && variant.price !== null) prices.set(variant.id, roundPrice(variant.price * 1.1));
    if (index === 1) stock.set(variant.id, Math.max(1, line.quantity - 1));
    if (index === 2) unavailable.add(variant.id);
  });
  return { prices, stock, unavailable };
}

export function validateCart(request: CartValidateRequest, options: Options): ValidatedCart {
  const { products, stock, overrides = noOverrides, now = new Date() } = options;
  const lines: ValidatedCartLine[] = [];
  const changes: CartChange[] = [];

  for (const req of request.lines) {
    const found = findVariant(products, req.variantId);
    if (!found) {
      changes.push({
        type: 'removed',
        variantId: req.variantId,
        productName: 'Produit retiré du catalogue',
        variantLabel: '',
        oldPrice: req.expectedUnitPrice,
        newPrice: null,
        oldQuantity: req.quantity,
        newQuantity: null,
      });
      continue;
    }
    const { product, variant } = found;

    const unitPrice = overrides.prices.get(variant.id) ?? variant.price;
    const available = isSellable(variant) && !overrides.unavailable.has(variant.id);
    const maxQuantity = overrides.stock.get(variant.id) ?? stock.get(variant.id) ?? null;

    const availability = available ? variant.availability : 'unavailable';
    const granted = available ? Math.min(req.quantity, maxQuantity ?? req.quantity) : 0;
    const base = {
      variantId: variant.id,
      productSlug: product.slug,
      productName: product.name,
      brand: product.brand,
      variantLabel: variant.label,
      imageUrl: product.imageUrl,
      color: product.color,
      availability,
      leadTimeDays: variant.leadTimeDays,
      minQuantity: variant.minQuantity,
      maxQuantity,
      unitPrice,
      requestedQuantity: req.quantity,
    } as const;
    const change = { variantId: variant.id, productName: product.name, variantLabel: variant.label };

    if (!available) {
      lines.push({ ...base, quantity: 0, lineTotal: 0, status: 'unavailable' });
      // Déjà signalé (la ligne est affichée indisponible) : pas de nouvelle alerte.
      if (req.expectedAvailability !== 'unavailable') {
        changes.push({
          ...change,
          type: 'unavailable',
          oldPrice: req.expectedUnitPrice,
          newPrice: null,
          oldQuantity: req.quantity,
          newQuantity: 0,
        });
      }
      continue;
    }

    let status: ValidatedCartLine['status'] = 'ok';
    if (granted < req.quantity) {
      status = 'quantity_reduced';
      changes.push({
        ...change,
        type: 'quantity_reduced',
        oldPrice: null,
        newPrice: null,
        oldQuantity: req.quantity,
        newQuantity: granted,
      });
    }
    if (unitPrice !== req.expectedUnitPrice) {
      if (status === 'ok') status = 'price_changed';
      changes.push({
        ...change,
        type: 'price_changed',
        oldPrice: req.expectedUnitPrice,
        newPrice: unitPrice,
        oldQuantity: null,
        newQuantity: null,
      });
    }
    lines.push({ ...base, quantity: granted, lineTotal: (unitPrice ?? 0) * granted, status });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const discountTotal = 0; // Coupons et remises panier : US-014.
  return {
    lines,
    changes,
    subtotal,
    discountTotal,
    total: subtotal - discountTotal,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    currency: 'XOF',
    validatedAt: now.toISOString(),
  };
}
