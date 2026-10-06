import { formatFCFA, type ProductSummary, type Variant } from '@afrisime/shared';

const NBSP = ' ';

/**
 * Prix affiché sur une carte produit (affichage seulement : le serveur décide du prix).
 * - pas de prix → « Prix sur devis »
 * - un seul prix → « 4 750 FCFA »
 * - fourchette → « Dès 4 750 FCFA »
 */
export function summaryPriceLabel(p: Pick<ProductSummary, 'priceFrom' | 'priceTo'>): string {
  if (p.priceFrom === null) return 'Prix sur devis';
  if (p.priceTo === null || p.priceTo === p.priceFrom) return formatFCFA(p.priceFrom);
  return `Dès${NBSP}${formatFCFA(p.priceFrom)}`;
}

/** Fourchette complète « 4 750 – 43 500 FCFA », comme sur le site. */
export function priceRangeLabel(p: Pick<ProductSummary, 'priceFrom' | 'priceTo'>): string | null {
  if (p.priceFrom === null) return null;
  if (p.priceTo === null || p.priceTo === p.priceFrom) return formatFCFA(p.priceFrom);
  const from = formatFCFA(p.priceFrom).replace(`${NBSP}FCFA`, '');
  return `${from} – ${formatFCFA(p.priceTo)}`;
}

export function variantPriceLabel(v: Pick<Variant, 'price'>): string {
  return v.price === null ? 'Prix sur devis' : formatFCFA(v.price);
}

/** Remise affichable seulement si le prix barré est strictement supérieur. */
export function variantDiscountPercent(v: Pick<Variant, 'price' | 'compareAtPrice'>): number | null {
  if (v.price === null || v.compareAtPrice === null || v.compareAtPrice <= v.price) return null;
  return Math.round((1 - v.price / v.compareAtPrice) * 100);
}
