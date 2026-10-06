import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { catalogApi } from './api';
import type { CatalogFilters } from './filters';

export const catalogKeys = {
  all: ['catalog'] as const,
  home: () => [...catalogKeys.all, 'home'] as const,
  categories: () => [...catalogKeys.all, 'categories'] as const,
  products: (filters: CatalogFilters) => [...catalogKeys.all, 'products', filters] as const,
  count: (filters: CatalogFilters) => [...catalogKeys.all, 'count', filters] as const,
  product: (slug: string) => [...catalogKeys.all, 'product', slug] as const,
  suggest: (q: string) => ['search', 'suggest', q] as const,
};

/** Catalogue : données qui changent peu, revalidées toutes les quelques minutes. */
const CATALOG_STALE_MS = 5 * 60_000;
/** Rayons : quasi statiques. */
const CATEGORIES_STALE_MS = 60 * 60_000;
const PAGE_SIZE = 20;

export function useHome() {
  return useQuery({
    queryKey: catalogKeys.home(),
    queryFn: ({ signal }) => catalogApi.getHome(signal),
    staleTime: CATALOG_STALE_MS,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.categories(),
    queryFn: ({ signal }) => catalogApi.listCategories(signal),
    staleTime: CATEGORIES_STALE_MS,
  });
}

/** Liste paginée filtrée. Les facettes, le total et la correction viennent de la 1re page. */
export function useProducts(filters: CatalogFilters = {}, options: { enabled?: boolean } = {}) {
  const result = useInfiniteQuery({
    queryKey: catalogKeys.products(filters),
    queryFn: ({ pageParam, signal }) =>
      catalogApi.listProducts({ ...filters, limit: PAGE_SIZE, cursor: pageParam ?? undefined }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: CATALOG_STALE_MS,
    enabled: options.enabled ?? true,
  });
  const items = useMemo(() => result.data?.pages.flatMap((p) => p.items) ?? [], [result.data]);
  const first = result.data?.pages[0];
  return {
    ...result,
    items,
    total: first?.total ?? 0,
    facets: first?.facets,
    priceBounds: first?.priceBounds ?? null,
    correctedQuery: first?.correctedQuery ?? null,
  };
}

/**
 * Aperçu pour le panneau de filtres : total et facettes des filtres EN COURS d'édition.
 * Débouncé pour ne pas envoyer une requête par tap.
 */
export function useFilterPreview(filters: CatalogFilters, enabled: boolean) {
  const debounced = useDebouncedValue(filters, 300);
  return useQuery({
    queryKey: catalogKeys.count(debounced),
    queryFn: ({ signal }) => catalogApi.listProducts({ ...debounced, limit: 1 }, signal),
    enabled,
    staleTime: CATALOG_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

/** Suggestions de saisie (≥ 2 caractères, 300 ms après la dernière frappe). */
export function useSuggestions(text: string) {
  const q = useDebouncedValue(text.trim(), 300);
  return useQuery({
    queryKey: catalogKeys.suggest(q),
    queryFn: ({ signal }) => catalogApi.suggest(q, signal),
    enabled: q.length >= 2,
    staleTime: CATALOG_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: catalogKeys.product(slug),
    queryFn: ({ signal }) => catalogApi.getProduct(slug, signal),
    staleTime: CATALOG_STALE_MS,
  });
}
