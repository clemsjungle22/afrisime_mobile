import {
  Category,
  Home,
  ProductDetail,
  ProductListResponse,
  SearchSuggestResponse,
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
  listProducts(query?: ProductListQuery, signal?: AbortSignal): Promise<ProductListResponse>;
  getProduct(slug: string, signal?: AbortSignal): Promise<ProductDetail>;
  suggest(q: string, signal?: AbortSignal): Promise<SearchSuggestResponse>;
};

export const CategoryList = z.array(Category);

const httpCatalogApi: CatalogApi = {
  getHome(signal) {
    return request('/v1/home', { schema: Home, signal });
  },
  listCategories(signal) {
    return request('/v1/categories', { schema: CategoryList, signal });
  },
  listProducts(query = {}, signal) {
    return request('/v1/products', { query, schema: ProductListResponse, signal });
  },
  getProduct(slug, signal) {
    return request(`/v1/products/${encodeURIComponent(slug)}`, { schema: ProductDetail, signal });
  },
  suggest(q, signal) {
    return request('/v1/search/suggest', { query: { q }, schema: SearchSuggestResponse, signal });
  },
};

export const catalogApi: CatalogApi = apiConfig.mock ? mockCatalogApi : httpCatalogApi;
