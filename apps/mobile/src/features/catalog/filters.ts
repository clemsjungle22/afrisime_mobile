import {
  Availability,
  ProductOffer,
  ProductOrigin,
  ProductSort,
  formatFCFA,
  type FacetKey,
  type Facets,
  type ProductListQuery,
} from '@afrisime/shared';
import { z } from 'zod';

/** Filtres + recherche + tri d'une liste produits (sans pagination). */
export type CatalogFilters = Omit<ProductListQuery, 'cursor' | 'limit'>;

/** Clés de filtre affichées dans le panneau (q et sort exclus). */
export const FILTER_KEYS = [
  'category',
  'brand',
  'minPrice',
  'maxPrice',
  'availability',
  'packaging',
  'origin',
  'offer',
] as const satisfies readonly (keyof CatalogFilters)[];

const slug = z.string().regex(/^[a-z0-9-]+$/);
const freeText = z.string().trim().min(1).max(100);
const amount = z.coerce.number().int().nonnegative().max(100_000_000);

/** Chaque paramètre est validé séparément : une valeur invalide est ignorée, pas fatale. */
const FilterParams = z.object({
  q: freeText.optional().catch(undefined),
  category: slug.optional().catch(undefined),
  brand: freeText.optional().catch(undefined),
  minPrice: amount.optional().catch(undefined),
  maxPrice: amount.optional().catch(undefined),
  availability: Availability.optional().catch(undefined),
  packaging: freeText.optional().catch(undefined),
  origin: ProductOrigin.optional().catch(undefined),
  offer: ProductOffer.optional().catch(undefined),
  sort: ProductSort.optional().catch(undefined),
});

type RawParams = Record<string, string | string[] | undefined>;

/** Paramètres de route (non fiables) → filtres typés, sans clé undefined. */
export function parseFilterParams(params: RawParams): CatalogFilters {
  const flat = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = FilterParams.parse(flat);
  const filters = Object.fromEntries(
    Object.entries(parsed).filter(([, v]) => v !== undefined),
  ) as CatalogFilters;
  // Bornes inversées : on les remet dans l'ordre plutôt que de renvoyer zéro résultat.
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined && filters.minPrice > filters.maxPrice) {
    [filters.minPrice, filters.maxPrice] = [filters.maxPrice, filters.minPrice];
  }
  return filters;
}

/** Filtres → paramètres de route. Toutes les clés sont présentes (undefined = retirer de l'URL). */
export function toFilterParams(filters: CatalogFilters): Record<string, string | undefined> {
  const keys = ['q', 'sort', ...FILTER_KEYS] as const;
  return Object.fromEntries(
    keys.map((k) => {
      const v = filters[k];
      return [k, v === undefined ? undefined : String(v)];
    }),
  );
}

export function countActiveFilters(filters: CatalogFilters, ignore: readonly (keyof CatalogFilters)[] = []): number {
  const price = filters.minPrice !== undefined || filters.maxPrice !== undefined ? 1 : 0;
  const others = FILTER_KEYS.filter(
    (k) => k !== 'minPrice' && k !== 'maxPrice' && !ignore.includes(k) && filters[k] !== undefined,
  ).length;
  return price + others;
}

export function priceRangeText(min?: number, max?: number): string | null {
  if (min !== undefined && max !== undefined) return `${formatFCFA(min)} – ${formatFCFA(max)}`;
  if (min !== undefined) return `Dès ${formatFCFA(min)}`;
  if (max !== undefined) return `Jusqu'à ${formatFCFA(max)}`;
  return null;
}

export type ActiveFilter = {
  id: string;
  label: string;
  /** Filtres sans ce critère. */
  remove: (filters: CatalogFilters) => CatalogFilters;
};

const facetKeys: FacetKey[] = ['category', 'brand', 'availability', 'packaging', 'origin', 'offer'];

function without<K extends keyof CatalogFilters>(...keys: K[]) {
  return (filters: CatalogFilters): CatalogFilters => {
    const next = { ...filters };
    for (const k of keys) delete next[k];
    return next;
  };
}

/** Puces des filtres actifs, libellées grâce aux facettes du serveur. */
export function activeFilters(
  filters: CatalogFilters,
  facets: Facets | undefined,
  ignore: readonly (keyof CatalogFilters)[] = [],
): ActiveFilter[] {
  const chips: ActiveFilter[] = [];
  for (const key of facetKeys) {
    const value = filters[key];
    if (value === undefined || ignore.includes(key)) continue;
    const label = facets?.[key].find((f) => f.value === value)?.label ?? String(value);
    chips.push({ id: key, label, remove: without(key) });
  }
  const price = priceRangeText(filters.minPrice, filters.maxPrice);
  if (price) chips.push({ id: 'price', label: price, remove: without('minPrice', 'maxPrice') });
  return chips;
}

export const sortLabels: Record<ProductSort, string> = {
  relevance: 'Pertinence',
  popular: 'Populaires',
  newest: 'Nouveautés',
  price_asc: 'Prix croissant',
  price_desc: 'Prix décroissant',
};

/** Tri par défaut : pertinence en recherche, popularité en navigation (comme le serveur). */
export function defaultSort(filters: CatalogFilters): ProductSort {
  return filters.q ? 'relevance' : 'popular';
}

/** Tranches de prix rapides (FCFA). Paramétrables plus tard via l'API si besoin. */
export const PRICE_PRESETS: readonly { label: string; min?: number; max?: number }[] = [
  { label: 'Moins de 1 000 FCFA', max: 999 },
  { label: '1 000 – 5 000 FCFA', min: 1000, max: 5000 },
  { label: '5 000 – 20 000 FCFA', min: 5000, max: 20000 },
  { label: 'Plus de 20 000 FCFA', min: 20000 },
];
