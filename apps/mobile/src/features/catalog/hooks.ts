import type { ProductListQuery } from '@afrisime/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { catalogApi } from './api';

export const catalogKeys = {
  all: ['catalog'] as const,
  products: (query: Omit<ProductListQuery, 'cursor'>) => [...catalogKeys.all, 'products', query] as const,
  product: (slug: string) => [...catalogKeys.all, 'product', slug] as const,
};

const CATALOG_STALE_MS = 5 * 60_000;

export function useProducts(query: Omit<ProductListQuery, 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: catalogKeys.products(query),
    queryFn: ({ pageParam, signal }) =>
      catalogApi.listProducts({ ...query, cursor: pageParam ?? undefined }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: CATALOG_STALE_MS,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: catalogKeys.product(slug),
    queryFn: ({ signal }) => catalogApi.getProduct(slug, signal),
    staleTime: CATALOG_STALE_MS,
  });
}
