import {
  Category,
  Home,
  ProductDetail,
  ProductListResponse,
  SearchSuggestResponse,
} from '@afrisime/shared';
import { z } from 'zod';
import type { CatalogApi } from '@/features/catalog/api';
import { withRetry } from '../client';
import { mockCategories } from './data/categories';
import { buildMockHome } from './data/home';
import { countByCategory, mockProducts, toSummary } from './data/products';
import { searchProducts, suggest } from './searchEngine';
import { mockError, simulate } from './simulate';

const CategoryList = z.array(Category);

/** Lecture : retry autorisé, comme pour un GET réel. */
function read<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  return withRetry(run, { canRetry: true, signal });
}

export const mockCatalogApi: CatalogApi = {
  getHome(signal) {
    return read(() => simulate(Home, () => buildMockHome()), signal);
  },

  listCategories(signal) {
    return read(
      () =>
        simulate(CategoryList, () =>
          mockCategories.map((c) => ({ ...c, productCount: countByCategory(c.slug) })),
        ),
      signal,
    );
  },

  listProducts(query = {}, signal) {
    return read(
      () =>
        simulate(ProductListResponse, () => {
          const result = searchProducts(mockProducts, query);
          const limit = query.limit ?? 20;
          const start = query.cursor ? Number(query.cursor) : 0;
          const next = start + limit;
          return {
            items: result.items.slice(start, next).map(toSummary),
            nextCursor: next < result.items.length ? String(next) : null,
            total: result.items.length,
            facets: result.facets,
            priceBounds: result.priceBounds,
            correctedQuery: result.correctedQuery,
          };
        }),
      signal,
    );
  },

  getProduct(slug, signal) {
    return read(
      () =>
        simulate(ProductDetail, () => {
          const product = mockProducts.find((p) => p.slug === slug);
          if (!product) throw mockError('NOT_FOUND', 'Ce produit est introuvable.', 404);
          return product;
        }),
      signal,
    );
  },

  suggest(q, signal) {
    return read(
      () => simulate(SearchSuggestResponse, () => ({ query: q, ...suggest(mockProducts, q) })),
      signal,
    );
  },
};
