import {
  type Category,
  type Home,
  type OnboardingOptions,
  type ProductDetail,
  type ProductListQuery,
  type ProductListResponse,
  type SearchSuggestResponse,
  buildHomeSections,
  searchProducts,
  suggest,
  toSummary,
} from '@afrisime/shared';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { type CatalogSnapshot, loadCatalog } from './repository';

/**
 * Le catalogue change rarement et reste petit : il est assemblé une fois puis gardé en mémoire
 * CATALOG_TTL_MS par segment tarifaire. Le back-office appellera invalidateCatalog() après une modification.
 */
export const CATALOG_TTL_MS = 60_000;
const DEFAULT_LIMIT = 20;

type Entry = { at: number; value: Promise<CatalogSnapshot> };
const cache = new Map<string, Entry>();

export function invalidateCatalog() {
  cache.clear();
}

export function getCatalog(segment = 'retail'): Promise<CatalogSnapshot> {
  const hit = cache.get(segment);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.value;
  // La promesse est mise en cache : des requêtes simultanées partagent le même chargement.
  const value = loadCatalog(getDb(), { segment });
  cache.set(segment, { at: Date.now(), value });
  value.catch(() => cache.delete(segment)); // un échec n'est pas mémorisé
  return value;
}

/** Curseur opaque : l'app le renvoie tel quel, sans l'interpréter. */
export const encodeCursor = (offset: number) => Buffer.from(`o:${offset}`).toString('base64url');

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const match = /^o:(\d{1,6})$/.exec(Buffer.from(cursor, 'base64url').toString());
  if (!match) throw new ApiError('VALIDATION_ERROR', 'Curseur de pagination invalide.');
  return Number(match[1]);
}

export async function listProducts(query: ProductListQuery): Promise<ProductListResponse> {
  const catalog = await getCatalog();
  const result = searchProducts(catalog.products, query, catalog.categories);
  const limit = query.limit ?? DEFAULT_LIMIT;
  const start = decodeCursor(query.cursor);
  const end = start + limit;
  return {
    items: result.items.slice(start, end).map(toSummary),
    nextCursor: end < result.items.length ? encodeCursor(end) : null,
    total: result.items.length,
    facets: result.facets,
    priceBounds: result.priceBounds,
    correctedQuery: result.correctedQuery,
  };
}

export async function getProduct(slug: string): Promise<ProductDetail> {
  const product = (await getCatalog()).bySlug.get(slug);
  if (!product) throw new ApiError('NOT_FOUND', 'Ce produit est introuvable.');
  return product;
}

export async function listCategories(): Promise<Category[]> {
  return (await getCatalog()).categories;
}

export async function suggestProducts(q: string): Promise<SearchSuggestResponse> {
  const catalog = await getCatalog();
  return { query: q, ...suggest(catalog.products, q, catalog.categories) };
}

export async function getHome(): Promise<Home> {
  const catalog = await getCatalog();
  return {
    banners: catalog.banners,
    categories: catalog.categories.map(({ id, slug, name, imageUrl, color }) => ({ id, slug, name, imageUrl, color })),
    sections: buildHomeSections(catalog.products.map(toSummary), catalog.flashEndsAt),
  };
}

export async function getOnboardingOptions(): Promise<OnboardingOptions> {
  const db = getDb();
  const [types, agencies, terms] = await Promise.all([
    db.select().from(s.customerTypes).orderBy(asc(s.customerTypes.sortOrder)),
    db.select().from(s.agencies).where(eq(s.agencies.isActive, true)).orderBy(asc(s.agencies.sortOrder)),
    db.select().from(s.appSettings).where(eq(s.appSettings.key, 'legal.terms')),
  ]);
  const legal = (terms[0]?.value ?? {}) as { version?: string; termsUrl?: string; privacyUrl?: string };
  if (!legal.version || !legal.termsUrl || !legal.privacyUrl) {
    throw new Error('Paramètre legal.terms manquant ou incomplet');
  }
  return {
    customerTypes: types.map(({ id, label, description, requiresReview }) => ({ id, label, description, requiresReview })),
    agencies: agencies.map(({ id, name, city, address, phone, openingHours, isDefault }) => ({
      id,
      name,
      city,
      address,
      phone,
      openingHours,
      isDefault,
    })),
    termsVersion: legal.version,
    termsUrl: legal.termsUrl,
    privacyUrl: legal.privacyUrl,
  };
}
