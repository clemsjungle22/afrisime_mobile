import {
  ProductDetail,
  ProductSummary,
  paginated,
  type Paginated,
  type ProductListQuery,
} from '@afrisime/shared';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockCatalogApi } from '@/api/mock/catalog';

/** Contrat du catalogue côté app : implémenté par le client HTTP et par le mock. */
export type CatalogApi = {
  listProducts(query?: ProductListQuery, signal?: AbortSignal): Promise<Paginated<ProductSummary>>;
  getProduct(slug: string, signal?: AbortSignal): Promise<ProductDetail>;
};

const ProductPage = paginated(ProductSummary);

const httpCatalogApi: CatalogApi = {
  listProducts(query = {}, signal) {
    return request('/v1/products', { query, schema: ProductPage, signal });
  },
  getProduct(slug, signal) {
    return request(`/v1/products/${encodeURIComponent(slug)}`, { schema: ProductDetail, signal });
  },
};

export const catalogApi: CatalogApi = apiConfig.mock ? mockCatalogApi : httpCatalogApi;
