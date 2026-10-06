import {
  Category,
  Home,
  ProductDetail,
  ProductSummary,
  paginated,
  type Paginated,
  type ProductListQuery,
} from '@afrisime/shared';
import { z } from 'zod';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockCatalogApi } from '@/api/mock/catalog';

/** Contrat du catalogue côté app : implémenté par le client HTTP et par le mock. */
export type CatalogApi = {
  getHome(signal?: AbortSignal): Promise<Home>;
  listCategories(signal?: AbortSignal): Promise<Category[]>;
  listProducts(query?: ProductListQuery, signal?: AbortSignal): Promise<Paginated<ProductSummary>>;
  getProduct(slug: string, signal?: AbortSignal): Promise<ProductDetail>;
};

export const ProductPage = paginated(ProductSummary);
export const CategoryList = z.array(Category);

const httpCatalogApi: CatalogApi = {
  getHome(signal) {
    return request('/v1/home', { schema: Home, signal });
  },
  listCategories(signal) {
    return request('/v1/categories', { schema: CategoryList, signal });
  },
  listProducts(query = {}, signal) {
    return request('/v1/products', { query, schema: ProductPage, signal });
  },
  getProduct(slug, signal) {
    return request(`/v1/products/${encodeURIComponent(slug)}`, { schema: ProductDetail, signal });
  },
};

export const catalogApi: CatalogApi = apiConfig.mock ? mockCatalogApi : httpCatalogApi;
