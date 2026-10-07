import {
  buildMockHome,
  countByCategory,
  mockCategories,
  mockOnboardingOptions,
  mockProducts,
} from '@afrisime/fixtures';
import { type ProductListQuery, searchProducts, toSummary } from '@afrisime/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as categoriesRoute } from '@/app/v1/categories/route';
import { GET as homeRoute } from '@/app/v1/home/route';
import { GET as onboardingRoute } from '@/app/v1/onboarding/options/route';
import { GET as productRoute } from '@/app/v1/products/[slug]/route';
import { GET as productsRoute } from '@/app/v1/products/route';
import { GET as suggestRoute } from '@/app/v1/search/suggest/route';
import { invalidateCatalog } from '@/server/catalog/service';
import { setDb } from '@/server/db/client';
import { seedDatabase } from '@/server/db/seed';
import { createTestDb } from './pglite';

/**
 * Équivalence serveur ↔ mode démo : avec les données d'exemple, le serveur doit répondre
 * exactement comme le mode démo de l'app. C'est ce qui rend la bascule (B5) sans surprise.
 */
let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  process.env.LOG_LEVEL = 'error';
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  invalidateCatalog();
});
afterAll(async () => {
  setDb(null);
  invalidateCatalog();
  await t.close();
});

const get = async (handler: (req: Request, ctx?: never) => Promise<Response>, url: string, ctx?: unknown) => {
  const res = await handler(new Request(`http://localhost${url}`), ctx as never);
  return { status: res.status, headers: res.headers, body: await res.json() };
};

const toParams = (q: ProductListQuery) =>
  new URLSearchParams(Object.entries(q).map(([k, v]) => [k, String(v)])).toString();

/** Ce que renverrait le mode démo (toute la liste, sans pagination). */
function demoList(q: ProductListQuery) {
  const r = searchProducts(mockProducts, q, mockCategories);
  return { items: r.items.map(toSummary), total: r.items.length, facets: r.facets, priceBounds: r.priceBounds, correctedQuery: r.correctedQuery };
}

const QUERIES: ProductListQuery[] = [
  {},
  { q: 'huile' },
  { q: 'hiule' },
  { q: 'vegetale' },
  { q: 'aqua lome' },
  { q: 'boissons' },
  { category: 'huiles', origin: 'local' },
  { category: 'cereales-farines', sort: 'price_asc' },
  { minPrice: 20000 },
  { minPrice: 1000, maxPrice: 5000, sort: 'price_desc' },
  { offer: 'pro' },
  { offer: 'promotion' },
  { availability: 'quote_only' },
  { availability: 'on_order' },
  { brand: 'Terroir Togo' },
  { packaging: 'sac' },
  { sort: 'newest' },
  { q: 'ordinateur' },
];

describe('équivalence avec le mode démo', () => {
  it.each(QUERIES)('GET /v1/products %j', async (q) => {
    const { status, body } = await get(productsRoute, `/v1/products?${toParams({ ...q, limit: 50 })}`);
    expect(status).toBe(200);
    const { nextCursor: _cursor, ...rest } = body;
    expect(rest).toEqual(demoList(q));
  });

  it('GET /v1/products/{slug} : chaque fiche est identique', async () => {
    for (const p of mockProducts) {
      const { status, body } = await get(productRoute, `/v1/products/${p.slug}`, { params: Promise.resolve({ slug: p.slug }) });
      expect(status).toBe(200);
      expect(body).toEqual(p);
    }
  });

  it('GET /v1/categories : rayons et nombres de produits', async () => {
    const { body } = await get(categoriesRoute, '/v1/categories');
    expect(body).toEqual(mockCategories.map((c) => ({ ...c, productCount: countByCategory(c.slug) })));
  });

  it("GET /v1/home : mêmes bannières, rayons et sections (hors date de fin des ventes flash)", async () => {
    const { body } = await get(homeRoute, '/v1/home');
    const demo = buildMockHome();
    const withoutEnd = (h: typeof demo) => ({ ...h, sections: h.sections.map((sec) => ({ ...sec, endsAt: sec.endsAt ? 'date' : null })) });
    expect(withoutEnd(body)).toEqual(withoutEnd(demo));
  });

  it('GET /v1/search/suggest : suggestions et correction', async () => {
    const { body } = await get(suggestRoute, '/v1/search/suggest?q=huil');
    expect(body.suggestions.some((s: { type: string; value: string }) => s.type === 'category' && s.value === 'huiles')).toBe(true);
    expect((await get(suggestRoute, '/v1/search/suggest?q=savn')).body.correctedQuery).toBe('savon');
    expect((await get(suggestRoute, '/v1/search/suggest?q=h')).body.suggestions).toEqual([]);
  });

  it("GET /v1/onboarding/options : listes de l'inscription", async () => {
    const { body } = await get(onboardingRoute, '/v1/onboarding/options');
    expect(body).toEqual(mockOnboardingOptions);
  });
});

describe('pagination et erreurs', () => {
  it('parcourt tout le catalogue par pages, sans doublon ni oubli', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/v1/products?limit=6${cursor ? `&cursor=${cursor}` : ''}`;
      const { body } = await get(productsRoute, url);
      expect(body.total).toBe(mockProducts.length);
      seen.push(...body.items.map((p: { slug: string }) => p.slug));
      cursor = body.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(Math.ceil(mockProducts.length / 6));
    expect(new Set(seen).size).toBe(mockProducts.length);
  });

  it('les réponses publiques sont réutilisables 60 s', async () => {
    const { headers } = await get(productsRoute, '/v1/products');
    expect(headers.get('cache-control')).toContain('max-age=60');
  });

  it('slug inconnu → 404 NOT_FOUND', async () => {
    const { status, body } = await get(productRoute, '/v1/products/inconnu', { params: Promise.resolve({ slug: 'inconnu' }) });
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it.each(['limit=abc', 'limit=500', 'minPrice=-5', 'sort=hasard', 'cursor=nimportequoi'])(
    'paramètre invalide (%s) → 400 VALIDATION_ERROR',
    async (qs) => {
      const { status, body } = await get(productsRoute, `/v1/products?${qs}`);
      expect(status).toBe(400);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    },
  );
});
