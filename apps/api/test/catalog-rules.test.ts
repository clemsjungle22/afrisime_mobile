import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadCatalog } from '@/server/catalog/repository';
import type { Db } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { createTestDb } from './pglite';

/** Règles du serveur sur des données modifiées (base dédiée, rechargée avant chaque test). */
let t: Awaited<ReturnType<typeof createTestDb>>;
let db: Db;

const RIZ_5KG = 'var_riz-parfume-savana_0';
const RIZ = 'riz-parfume-savana';
const HOUR = 3_600_000;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await db.update(s.products).set({ isActive: true });
  await db.update(s.productVariants).set({ isActive: true });
  await db.update(s.categories).set({ isActive: true });
  await db.update(s.homeBanners).set({ isActive: true, startsAt: null, endsAt: null });
  await seedDatabase(db);
});

const variant = async (variantId: string, now?: Date) =>
  (await loadCatalog(db, { now })).products.flatMap((p) => p.variants).find((v) => v.id === variantId);

describe('prix', () => {
  it("un prix promo s'applique pendant sa période, puis le prix normal revient", async () => {
    const now = new Date();
    // Prix normal (sans prix barré) et promo plus récente, valable 2 h.
    await db.update(s.prices).set({ compareAtAmount: null, amount: 5200 }).where(eq(s.prices.variantId, RIZ_5KG));
    await db.insert(s.prices).values({
      variantId: RIZ_5KG,
      amount: 4500,
      compareAtAmount: 5200,
      validFrom: new Date(now.getTime() - HOUR),
      validTo: new Date(now.getTime() + 2 * HOUR),
    });

    expect(await variant(RIZ_5KG, now)).toMatchObject({ price: 4500, compareAtPrice: 5200 });
    const later = new Date(now.getTime() + 3 * HOUR);
    expect(await variant(RIZ_5KG, later)).toMatchObject({ price: 5200, compareAtPrice: null });
  });

  it('la fin des ventes flash suit la fin de la promo la plus proche', async () => {
    const end = new Date(Date.now() + 2 * HOUR);
    end.setMilliseconds(0);
    await db.update(s.prices).set({ validTo: end }).where(eq(s.prices.variantId, RIZ_5KG));
    expect((await loadCatalog(db)).flashEndsAt).toBe(end.toISOString());
  });

  it('un prix de segment « pro » prime pour un client pro, pas pour le public', async () => {
    await db.insert(s.prices).values({ variantId: RIZ_5KG, segment: 'pro', amount: 4400 });
    expect((await loadCatalog(db, { segment: 'pro' })).bySlug.get(RIZ)?.variants[0]?.price).toBe(4400);
    expect((await loadCatalog(db)).bySlug.get(RIZ)?.variants[0]?.price).toBe(4750);
  });

  it('un format sans prix en vigueur est masqué (sauf sur devis)', async () => {
    await db.delete(s.prices).where(eq(s.prices.variantId, RIZ_5KG));
    const riz = (await loadCatalog(db)).bySlug.get(RIZ);
    expect(riz?.variants.map((v) => v.id)).not.toContain(RIZ_5KG);
    expect(riz?.defaultVariant.id).toBe('var_riz-parfume-savana_1');
  });
});

describe('disponibilité', () => {
  it('stock vendable à zéro → indisponible ; le réservé compte', async () => {
    await db.update(s.stockLevels).set({ onHand: 3, reserved: 3 }).where(eq(s.stockLevels.variantId, RIZ_5KG));
    expect((await variant(RIZ_5KG))?.availability).toBe('unavailable');
    await db.update(s.stockLevels).set({ reserved: 2 }).where(eq(s.stockLevels.variantId, RIZ_5KG));
    expect((await variant(RIZ_5KG))?.availability).toBe('available');
  });

  it("le stock d'une agence fermée ne compte pas", async () => {
    await db.update(s.agencies).set({ isActive: false }).where(eq(s.agencies.id, 'agc_lome_centre'));
    expect((await variant(RIZ_5KG))?.availability).toBe('unavailable');
    await db.update(s.agencies).set({ isActive: true }).where(eq(s.agencies.id, 'agc_lome_centre'));
  });

  it("la quantité exacte n'est jamais exposée", async () => {
    const json = JSON.stringify((await loadCatalog(db)).products);
    expect(json).not.toMatch(/"(onHand|reserved|sellable|stock\w*|quantity)":/i);
  });
});

describe('visibilité', () => {
  it('produit désactivé : absent de la liste et des rayons', async () => {
    await db.update(s.products).set({ isActive: false }).where(eq(s.products.slug, RIZ));
    const catalog = await loadCatalog(db);
    expect(catalog.bySlug.has(RIZ)).toBe(false);
    expect(catalog.products.some((p) => p.related.some((r) => r.slug === RIZ))).toBe(false);
    expect(catalog.categories.find((c) => c.slug === 'cereales-farines')?.productCount).toBe(3);
  });

  it('rayon désactivé : le rayon et ses produits disparaissent', async () => {
    await db.update(s.categories).set({ isActive: false }).where(eq(s.categories.slug, 'boissons'));
    const catalog = await loadCatalog(db);
    expect(catalog.categories.map((c) => c.slug)).not.toContain('boissons');
    expect(catalog.products.some((p) => p.categoryId === 'boissons')).toBe(false);
  });

  it('bannière hors période : masquée', async () => {
    await db
      .update(s.homeBanners)
      .set({ endsAt: new Date(Date.now() - HOUR) })
      .where(and(eq(s.homeBanners.id, 'ban_pro'), isNull(s.homeBanners.endsAt)));
    expect((await loadCatalog(db)).banners.map((b) => b.id)).toEqual(['ban_bienvenue', 'ban_local']);
  });
});
