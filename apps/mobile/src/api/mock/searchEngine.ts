import type {
  FacetKey,
  FacetValue,
  Facets,
  PriceBounds,
  ProductDetail,
  ProductListQuery,
  ProductOffer,
  Suggestion,
} from '@afrisime/shared';
import { mockCategories } from './data/categories';

/**
 * Moteur de recherche SIMULÉ : reproduit le comportement attendu du serveur
 * (insensible aux accents, une faute de frappe tolérée par mot, facettes, tris).
 */

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

/** Distance d'édition bornée (Damerau simplifié : inversion de 2 lettres = 1). */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const row = d[i]!;
      const prev = d[i - 1]!;
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j]!, d[i - 2]![j - 2]! + 1);
      }
    }
  }
  return d[a.length]![b.length]!;
}

function categoryName(slug: string): string {
  return mockCategories.find((c) => c.slug === slug)?.name ?? '';
}

function searchableText(p: ProductDetail): string {
  return [p.name, p.brand, categoryName(p.categoryId), ...p.variants.map((v) => v.packaging)].join(' ');
}

type TokenMatch = { score: number; correction: string | null };

/** Un mot de la requête correspond-il à un mot du produit ? Préfixe exact sinon 1 faute (mots ≥ 4 lettres). */
function matchToken(queryToken: string, productTokens: string[]): TokenMatch | null {
  if (productTokens.some((t) => t === queryToken)) return { score: 3, correction: null };
  if (productTokens.some((t) => t.startsWith(queryToken))) return { score: 2, correction: null };
  if (queryToken.length >= 4) {
    const close = productTokens.find(
      (t) => editDistance(queryToken, t.slice(0, queryToken.length + 1), 1) <= 1 || editDistance(queryToken, t, 1) <= 1,
    );
    if (close) return { score: 1, correction: close };
  }
  return null;
}

type TextMatch = { score: number; corrections: Map<string, string> };

function matchText(q: string, p: ProductDetail): TextMatch | null {
  const qTokens = tokens(q);
  const pTokens = tokens(searchableText(p));
  let score = 0;
  const corrections = new Map<string, string>();
  for (const qt of qTokens) {
    const m = matchToken(qt, pTokens);
    if (!m) return null;
    score += m.score;
    if (m.correction) corrections.set(qt, m.correction);
  }
  if (normalize(p.name).startsWith(normalize(q))) score += 5;
  return { score, corrections };
}

function hasOffer(p: ProductDetail, offer: ProductOffer): boolean {
  switch (offer) {
    case 'promotion':
      return p.badges.includes('promotion') || p.discountPercent !== null;
    case 'new':
      return p.badges.includes('new');
    case 'pro':
      return p.badges.includes('b2b') || p.variants.some((v) => v.isPro);
  }
}

function inPriceRange(p: ProductDetail, min?: number, max?: number): boolean {
  if (min === undefined && max === undefined) return true;
  return p.variants.some(
    (v) => v.price !== null && (min === undefined || v.price >= min) && (max === undefined || v.price <= max),
  );
}

type FilterKey = FacetKey | 'price';

/** Applique tous les filtres sauf `except` (pour le calcul des facettes). */
function matchesFilters(p: ProductDetail, q: ProductListQuery, except?: FilterKey): boolean {
  if (except !== 'category' && q.category && p.categoryId !== q.category) return false;
  if (except !== 'brand' && q.brand && p.brand !== q.brand) return false;
  if (except !== 'availability' && q.availability && !p.variants.some((v) => v.availability === q.availability)) {
    return false;
  }
  if (except !== 'packaging' && q.packaging && !p.variants.some((v) => v.packaging === q.packaging)) return false;
  if (except !== 'origin' && q.origin && p.origin !== q.origin) return false;
  if (except !== 'offer' && q.offer && !hasOffer(p, q.offer)) return false;
  if (except !== 'price' && !inPriceRange(p, q.minPrice, q.maxPrice)) return false;
  return true;
}

const availabilityLabels = {
  available: 'Disponible',
  on_order: 'Sur commande',
  unavailable: 'Temporairement indisponible',
  quote_only: 'Sur devis',
} as const;

const offerLabels: Record<ProductOffer, string> = {
  promotion: 'Promotions',
  new: 'Nouveautés',
  pro: 'Formats pro',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function countValues(
  products: ProductDetail[],
  valuesOf: (p: ProductDetail) => string[],
  labelOf: (value: string) => string,
): FacetValue[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    for (const v of new Set(valuesOf(p))) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labelOf(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
}

function computeFacets(base: ProductDetail[], q: ProductListQuery): Facets {
  const scope = (key: FacetKey) => base.filter((p) => matchesFilters(p, q, key));
  return {
    category: countValues(scope('category'), (p) => [p.categoryId], categoryName),
    brand: countValues(scope('brand'), (p) => [p.brand], (v) => v),
    availability: countValues(
      scope('availability'),
      (p) => p.variants.map((v) => v.availability),
      (v) => availabilityLabels[v as keyof typeof availabilityLabels] ?? v,
    ),
    packaging: countValues(scope('packaging'), (p) => p.variants.map((v) => v.packaging), capitalize),
    origin: countValues(scope('origin'), (p) => [p.origin], (v) => (v === 'local' ? 'Local' : 'Importé')),
    offer: countValues(
      scope('offer'),
      (p) => (['promotion', 'new', 'pro'] as const).filter((o) => hasOffer(p, o)),
      (v) => offerLabels[v as ProductOffer] ?? v,
    ),
  };
}

function priceBoundsOf(products: ProductDetail[]): PriceBounds | null {
  const prices = products.flatMap((p) => p.variants.map((v) => v.price)).filter((x): x is number => x !== null);
  return prices.length > 0 ? { min: Math.min(...prices), max: Math.max(...prices) } : null;
}

export type SearchResult = {
  items: ProductDetail[];
  facets: Facets;
  priceBounds: PriceBounds | null;
  correctedQuery: string | null;
};

/** Recherche + filtres + tri + facettes sur le catalogue mock. `rank` = ordre de nouveauté. */
export function searchProducts(all: ProductDetail[], q: ProductListQuery): SearchResult {
  const scores = new Map<string, number>();
  let base = all;
  let correctedQuery: string | null = null;

  if (q.q) {
    const corrections = new Map<string, string>();
    base = all.filter((p) => {
      const m = matchText(q.q!, p);
      if (!m) return false;
      scores.set(p.id, m.score);
      m.corrections.forEach((to, from) => corrections.set(from, to));
      return true;
    });
    if (corrections.size > 0) {
      correctedQuery = tokens(q.q).map((t) => corrections.get(t) ?? t).join(' ');
    }
  }

  const items = base.filter((p) => matchesFilters(p, q));
  const indexOf = new Map(all.map((p, i) => [p.id, i]));
  const priceKey = (p: ProductDetail) => p.priceFrom ?? Number.MAX_SAFE_INTEGER;
  const popularity = (p: ProductDetail) => (p.badges.includes('popular') ? 1 : 0);
  const newness = (p: ProductDetail) => (p.badges.includes('new') ? 1 : 0);

  const sort = q.sort ?? (q.q ? 'relevance' : 'popular');
  const sorted = [...items].sort((a, b) => {
    switch (sort) {
      case 'price_asc':
        return priceKey(a) - priceKey(b);
      case 'price_desc':
        return (b.priceFrom ?? -1) - (a.priceFrom ?? -1);
      case 'newest':
        return newness(b) - newness(a) || indexOf.get(b.id)! - indexOf.get(a.id)!;
      case 'popular':
        return popularity(b) - popularity(a) || indexOf.get(a.id)! - indexOf.get(b.id)!;
      case 'relevance':
        return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || popularity(b) - popularity(a);
    }
  });

  return {
    items: sorted,
    facets: computeFacets(base, q),
    priceBounds: priceBoundsOf(base.filter((p) => matchesFilters(p, q, 'price'))),
    correctedQuery,
  };
}

/** Suggestions de saisie : rayons, marques, produits correspondant à la saisie. */
export function suggest(all: ProductDetail[], query: string): { suggestions: Suggestion[]; correctedQuery: string | null } {
  const nq = normalize(query);
  if (nq.length < 2) return { suggestions: [], correctedQuery: null };

  const categories: Suggestion[] = mockCategories
    .filter((c) => normalize(c.name).split(' ').some((w) => w.startsWith(nq)))
    .map((c) => ({ type: 'category', label: c.name, value: c.slug }));

  const brands: Suggestion[] = [...new Set(all.map((p) => p.brand))]
    .filter((b) => normalize(b).includes(nq))
    .map((b) => ({ type: 'brand', label: b, value: b }));

  const result = searchProducts(all, { q: query, sort: 'relevance' });
  const products: Suggestion[] = result.items
    .slice(0, 5)
    .map((p) => ({ type: 'product', label: p.name, value: p.slug }));

  return {
    suggestions: [...categories.slice(0, 2), ...brands.slice(0, 2), ...products].slice(0, 8),
    correctedQuery: result.correctedQuery,
  };
}
