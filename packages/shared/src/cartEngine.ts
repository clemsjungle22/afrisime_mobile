import type {
  CartChange,
  CartValidateRequest,
  ProductDetail,
  ValidatedCart,
  ValidatedCartLine,
  Variant,
} from './index';

/**
 * Revalidation du panier (POST /v1/cart/validate), partagée par le serveur et le mode démo :
 * prix et stock courants, quantités accordées, totaux entiers, liste des changements.
 */

/** Modifications appliquées par-dessus le catalogue (scénarios de test du mode démo). */
export type CatalogOverrides = {
  prices: ReadonlyMap<string, number>;
  stock: ReadonlyMap<string, number>;
  unavailable: ReadonlySet<string>;
};

export const noOverrides: CatalogOverrides = {
  prices: new Map(),
  stock: new Map(),
  unavailable: new Set(),
};

type Options = {
  products: ProductDetail[];
  /** Quantité commandable par format, seulement quand elle limite la commande (absent = non limité). */
  stock: ReadonlyMap<string, number>;
  /** Modifications simulées (scénario de test) appliquées par-dessus le catalogue. */
  overrides?: CatalogOverrides;
  now?: Date;
};

export function findVariant(products: ProductDetail[], variantId: string) {
  for (const product of products) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

function isSellable(v: Variant): boolean {
  return (v.availability === 'available' || v.availability === 'on_order') && v.price !== null;
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
