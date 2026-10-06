import type { ProductListQuery } from '@afrisime/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { catalogApi } from './api';

type ListQuery = Omit<ProductListQuery, 'cursor'>;

export const catalogKeys = {
  all: ['catalog'] as const,
  home: () => [...catalogKeys.all, 'home'] as const,
  categories: () => [...catalogKeys.all, 'categories'] as const,
  products: (query: ListQuery) => [...catalogKeys.all, 'products', query] as const,
  product: (slug: string) => [...catalogKeys.all, 'product', slug] as const,
};

/** Catalogue : données qui changent peu, revalidées toutes les quelques minutes. */
const CATALOG_STALE_MS = 5 * 60_000;
/** Rayons : quasi statiques. */
const CATEGORIES_STALE_MS = 60 * 60_000;

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

export function useProducts(query: ListQuery = {}) {
  const result = useInfiniteQuery({
    queryKey: catalogKeys.products(query),
    queryFn: ({ pageParam, signal }) =>
      catalogApi.listProducts({ ...query, cursor: pageParam ?? undefined }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: CATALOG_STALE_MS,
  });
  const items = useMemo(() => result.data?.pages.flatMap((p) => p.items) ?? [], [result.data]);
  return { ...result, items };
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: catalogKeys.product(slug),
    queryFn: ({ signal }) => catalogApi.getProduct(slug, signal),
    staleTime: CATALOG_STALE_MS,
  });
}
