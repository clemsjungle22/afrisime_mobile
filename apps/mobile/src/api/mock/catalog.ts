import { ProductDetail, ProductSummary, paginated, type ProductListQuery } from '@afrisime/shared';
import { withRetry } from '../client';
import type { CatalogApi } from '@/features/catalog/api';
import { mockProducts, toSummary } from './data/products';
import { mockError, simulate } from './simulate';

const ProductPage = paginated(ProductSummary);

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function sortValue(p: ProductDetail): number {
  return p.priceFrom ?? Number.MAX_SAFE_INTEGER;
}

export const mockCatalogApi: CatalogApi = {
  listProducts(query: ProductListQuery = {}, signal?: AbortSignal) {
    return withRetry(
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
          const page = items.slice(start, start + limit);
          const next = start + limit;
          return {
            items: page.map(toSummary),
            nextCursor: next < items.length ? String(next) : null,
          };
        }),
      { canRetry: true, signal },
    );
  },

  getProduct(slug: string, signal?: AbortSignal) {
    return withRetry(
      () =>
        simulate(ProductDetail, () => {
          const product = mockProducts.find((p) => p.slug === slug);
          if (!product) throw mockError('NOT_FOUND', 'Ce produit est introuvable.', 404);
          return product;
        }),
      { canRetry: true, signal },
    );
  },
};
