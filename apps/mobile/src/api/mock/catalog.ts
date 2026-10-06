import { Category, Home, ProductDetail, ProductSummary, paginated } from '@afrisime/shared';
import { z } from 'zod';
import type { CatalogApi } from '@/features/catalog/api';
import { withRetry } from '../client';
import { mockCategories } from './data/categories';
import { buildMockHome } from './data/home';
import { countByCategory, mockProducts, toSummary } from './data/products';
import { mockError, simulate } from './simulate';

const ProductPage = paginated(ProductSummary);
const CategoryList = z.array(Category);

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function sortValue(p: ProductDetail): number {
  return p.priceFrom ?? Number.MAX_SAFE_INTEGER;
}

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
        simulate(ProductPage, () => {
          let items = mockProducts;
          if (query.q) {
            const q = normalize(query.q);
            items = items.filter((p) => normalize(`${p.name} ${p.brand}`).includes(q));
          }
          if (query.category) items = items.filter((p) => p.categoryId === query.category);
          if (query.availability) {
            items = items.filter((p) => p.variants.some((v) => v.availability === query.availability));
          }
          if (query.origin) items = items.filter((p) => p.origin === query.origin);
          if (query.sort === 'price_asc') items = [...items].sort((a, b) => sortValue(a) - sortValue(b));
          if (query.sort === 'price_desc') items = [...items].sort((a, b) => sortValue(b) - sortValue(a));

          const limit = query.limit ?? 20;
          const start = query.cursor ? Number(query.cursor) : 0;
          const next = start + limit;
          return {
            items: items.slice(start, next).map(toSummary),
            nextCursor: next < items.length ? String(next) : null,
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
};
