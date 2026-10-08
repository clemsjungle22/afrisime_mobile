import type { AdminNewVariant, AdminRole } from '@afrisime/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as moveCategoryRoute } from '@/app/v1/admin/catalog/categories/[id]/move/route';
import { PATCH as patchCategoryRoute } from '@/app/v1/admin/catalog/categories/[id]/route';
import {
  GET as categoriesRoute,
  POST as createCategoryRoute,
} from '@/app/v1/admin/catalog/categories/route';
import { POST as endPriceRoute } from '@/app/v1/admin/catalog/prices/[id]/end/route';
import {
  GET as productRoute,
  PATCH as patchProductRoute,
} from '@/app/v1/admin/catalog/products/[id]/route';
import { POST as addVariantRoute } from '@/app/v1/admin/catalog/products/[id]/variants/route';
import {
  GET as productsRoute,
  POST as createProductRoute,
} from '@/app/v1/admin/catalog/products/route';
import { GET as movementsRoute } from '@/app/v1/admin/catalog/variants/[id]/movements/route';
import { POST as pricesRoute } from '@/app/v1/admin/catalog/variants/[id]/prices/route';
import { POST as promoRoute } from '@/app/v1/admin/catalog/variants/[id]/promotions/route';
import { PATCH as patchVariantRoute } from '@/app/v1/admin/catalog/variants/[id]/route';
import { POST as stockRoute } from '@/app/v1/admin/catalog/variants/[id]/stock/route';
import { POST as thresholdRoute } from '@/app/v1/admin/catalog/variants/[id]/threshold/route';
import { login } from '@/server/admin/auth';
import { hashPassword } from '@/server/admin/crypto';
import { loadCatalog } from '@/server/catalog/repository';
import { getCatalog, invalidateCatalog } from '@/server/catalog/service';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { closeReservations, reserveStock } from '@/server/orders/state';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
const tokens: Partial<Record<AdminRole, string>> = {};
const RIZ = 'prd_0001';

const HUILE_1L = 'var_huile-vegetale-golfe-dor_0'; // 1 300 F
const HOUR = 3_600_000;

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  invalidateCatalog();
  const hash = await hashPassword('mot-de-passe-catalogue');
  for (const role of ['catalog', 'orders'] as AdminRole[]) {
    const email = `${role}@catalogue.test`;
    await t.db.insert(s.adminUsers).values({
      id: `adm_cat_${role}`,
      email,
      name: `Équipe ${role}`,
      role,
      passwordHash: hash,
      mustChangePassword: false,
    });
    tokens[role] = (
      (await login(
        t.db,
        { email, password: 'mot-de-passe-catalogue' },
        { ip: '1.1.1.1', userAgent: null },
      )) as { token: string }
    ).token;
  }
});
afterAll(async () => {
  setDb(null);
  invalidateCatalog();
  await t.close();
});

const as = (role: AdminRole = 'catalog') => ({ token: tokens[role]! });
const get = (
  handler: Parameters<typeof call>[0],
  url: string,
  params?: Record<string, string>,
  role?: AdminRole,
) => call(handler, 'GET', url, { ...as(role), params });
const post = (
  handler: Parameters<typeof call>[0],
  url: string,
  body: unknown,
  params?: Record<string, string>,
  role?: AdminRole,
) => call(handler, 'POST', url, { ...as(role), params, body });
const patch = (
  handler: Parameters<typeof call>[0],
  url: string,
  body: unknown,
  params?: Record<string, string>,
  role?: AdminRole,
) => call(handler, 'PATCH', url, { ...as(role), params, body });

/** Ce que voit l'app (catalogue public), sans attendre l'expiration du cache. */
const app = async (now?: Date) => {
  invalidateCatalog();
  return now ? loadCatalog(t.db, { now }) : getCatalog();
};

const variant = (
  overrides: Partial<AdminNewVariant['variant']> = {},
): AdminNewVariant['variant'] => ({
  label: 'Bouteille 1 L',
  packaging: 'Bouteille',
  saleMode: 'standard',
  leadTimeDays: null,
  minQuantity: 1,
  isPro: false,
  isActive: true,
  ...overrides,
});

describe('produits', () => {
  it('créer un produit : il apparaît dans l’app avec son prix et son stock', async () => {
    const res = await post(createProductRoute, '/v1/admin/catalog/products', {
      product: {
        name: "Huile d'arachide Kara",
        brand: 'Kara Bio',
        origin: 'local',
        categoryId: 'cat_huiles',
        description: 'Huile d’arachide pressée à froid.',
        badges: ['new'],
        isActive: true,
      },
      first: {
        variant: variant(),
        price: 1800,
        initialStock: [{ agencyId: 'agc_lome_centre', quantity: 40 }],
      },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ slug: 'huile-d-arachide-kara', badges: ['new'] });
    const v = res.body.variants[0];
    expect(v).toMatchObject({
      packaging: 'bouteille',
      availability: 'available',
      current: { retail: 1800, pro: null, promo: null },
    });
    expect(
      v.stock.find((st: { agencyId: string }) => st.agencyId === 'agc_lome_centre'),
    ).toMatchObject({ onHand: 40, sellable: 40 });

    const seen = (await app()).bySlug.get('huile-d-arachide-kara');
    expect(seen).toMatchObject({
      name: "Huile d'arachide Kara",
      priceFrom: 1800,
      categoryId: 'huiles',
      badges: ['new'],
    });

    const movements = await get(movementsRoute, `/v1/admin/catalog/variants/${v.id}/movements`, {
      id: v.id,
    });
    expect(movements.body).toEqual([
      expect.objectContaining({
        reason: 'initial',
        delta: 40,
        onHandAfter: 40,
        actor: 'Équipe catalog',
      }),
    ]);
  });

  it('même nom : identifiant lisible distinct ; prix obligatoire sauf « sur devis »', async () => {
    const product = {
      name: 'Riz parfumé long grain',
      brand: 'Autre',
      origin: 'imported',
      categoryId: 'cat_cereales',
      description: '',
      badges: [],
      isActive: true,
    };
    const ok = await post(createProductRoute, '/v1/admin/catalog/products', {
      product,
      first: { variant: variant(), price: 900, initialStock: [] },
    });
    expect(ok.body.slug).toBe('riz-parfume-long-grain');
    const again = await post(createProductRoute, '/v1/admin/catalog/products', {
      product,
      first: { variant: variant(), price: 900, initialStock: [] },
    });
    expect(again.body.slug).toBe('riz-parfume-long-grain-2');
    const noPrice = await post(createProductRoute, '/v1/admin/catalog/products', {
      product,
      first: { variant: variant(), price: null, initialStock: [] },
    });
    expect(noPrice.status).toBe(400);
    const quote = await post(createProductRoute, '/v1/admin/catalog/products', {
      product,
      first: {
        variant: variant({ saleMode: 'quote_only', label: 'Conteneur' }),
        price: null,
        initialStock: [],
      },
    });
    expect(quote.body.variants[0]).toMatchObject({
      availability: 'quote_only',
      current: { retail: null },
    });
  });

  it('désactiver un produit puis un format : il disparaît de l’app', async () => {
    const before = await get(productRoute, `/v1/admin/catalog/products/${RIZ}`, { id: RIZ });
    const { id: _id, slug: _s, createdAt: _c, updatedAt: _u, variants: _v, ...input } = before.body;
    await patch(
      patchProductRoute,
      `/v1/admin/catalog/products/${RIZ}`,
      { ...input, isActive: false },
      { id: RIZ },
    );
    expect((await app()).bySlug.has('riz-parfume-savana')).toBe(false);
    await patch(
      patchProductRoute,
      `/v1/admin/catalog/products/${RIZ}`,
      { ...input, isActive: true },
      { id: RIZ },
    );

    const v = before.body.variants[2];
    await patch(
      patchVariantRoute,
      `/v1/admin/catalog/variants/${v.id}`,
      { ...variant({ label: v.label, packaging: v.packaging, isPro: true }), isActive: false },
      { id: v.id },
    );
    const riz = (await app()).bySlug.get('riz-parfume-savana');
    expect(riz?.variants.map((x) => x.id)).not.toContain(v.id);
    expect(riz?.variantsCount).toBe(2);
  });

  it('ajouter un format sur commande : délai obligatoire', async () => {
    const missing = await post(
      addVariantRoute,
      `/v1/admin/catalog/products/${RIZ}/variants`,
      {
        variant: variant({ label: 'Sac 100 kg', saleMode: 'on_order' }),
        price: 85000,
        initialStock: [],
      },
      { id: RIZ },
    );
    expect(missing.status).toBe(400);
    const res = await post(
      addVariantRoute,
      `/v1/admin/catalog/products/${RIZ}/variants`,
      {
        variant: variant({
          label: 'Sac 100 kg',
          packaging: 'sac',
          saleMode: 'on_order',
          leadTimeDays: 5,
        }),
        price: 85000,
        initialStock: [],
      },
      { id: RIZ },
    );
    expect(res.status).toBe(201);
    expect(res.body.variants.at(-1)).toMatchObject({
      label: 'Sac 100 kg',
      availability: 'on_order',
      leadTimeDays: 5,
    });
  });

  it('liste : recherche, filtre rayon, ruptures', async () => {
    const all = await get(productsRoute, '/v1/admin/catalog/products?status=all');
    expect(all.body.total).toBeGreaterThanOrEqual(20);
    expect(
      (await get(productsRoute, '/v1/admin/catalog/products?q=savana')).body.items[0],
    ).toMatchObject({ brand: 'Savana', onPromotion: true });
    const huiles = await get(productsRoute, '/v1/admin/catalog/products?categoryId=cat_huiles');
    expect(
      huiles.body.items.every((p: { category: { id: string } }) => p.category.id === 'cat_huiles'),
    ).toBe(true);
    const low = await get(productsRoute, '/v1/admin/catalog/products?lowStock=1');
    expect(low.body.items.map((p: { slug: string }) => p.slug)).toContain('cubes-assaisonnement');
  });
});

describe('prix et promotions', () => {
  it('changer le prix public : immédiat, l’ancien reste dans l’historique', async () => {
    const res = await post(
      pricesRoute,
      `/v1/admin/catalog/variants/${HUILE_1L}/prices`,
      { segment: 'retail', amount: 1350 },
      { id: HUILE_1L },
    );
    expect(res.status).toBe(201);
    const v = res.body.variants.find((x: { id: string }) => x.id === HUILE_1L);
    expect(v.current.retail).toBe(1350);
    expect(v.prices.map((p: { amount: number; state: string }) => [p.amount, p.state])).toEqual(
      expect.arrayContaining([
        [1350, 'current'],
        [1300, 'replaced'],
      ]),
    );
    expect((await app()).bySlug.get('huile-vegetale-golfe-dor')?.variants[0]?.price).toBe(1350);
  });

  it('prix programmé : appliqué seulement à sa date', async () => {
    const at = new Date(Date.now() + 2 * HOUR);
    await post(
      pricesRoute,
      `/v1/admin/catalog/variants/${HUILE_1L}/prices`,
      { segment: 'retail', amount: 1400, validFrom: at.toISOString() },
      { id: HUILE_1L },
    );
    expect((await app(new Date())).bySlug.get('huile-vegetale-golfe-dor')?.variants[0]?.price).toBe(
      1350,
    );
    expect(
      (await app(new Date(at.getTime() + 1000))).bySlug.get('huile-vegetale-golfe-dor')?.variants[0]
        ?.price,
    ).toBe(1400);
  });

  it('prix pro : visible seulement pour le segment pro', async () => {
    await post(
      pricesRoute,
      `/v1/admin/catalog/variants/${HUILE_1L}/prices`,
      { segment: 'pro', amount: 1200 },
      { id: HUILE_1L },
    );
    expect(
      (await loadCatalog(t.db, { segment: 'pro' })).bySlug.get('huile-vegetale-golfe-dor')
        ?.variants[0]?.price,
    ).toBe(1200);
    expect((await app()).bySlug.get('huile-vegetale-golfe-dor')?.variants[0]?.price).toBe(1350);
  });

  it('promotion : prix barré, badge et vente flash ; refusée si pas moins chère ou en chevauchement ; arrêt anticipé', async () => {
    const SUCRE = 'var_sucre-en-poudre_0';
    const now = Date.now();
    const body = (amount: number) => ({
      amount,
      startsAt: new Date(now).toISOString(),
      endsAt: new Date(now + 48 * HOUR).toISOString(),
    });
    expect(
      (
        await post(promoRoute, `/v1/admin/catalog/variants/${SUCRE}/promotions`, body(900), {
          id: SUCRE,
        })
      ).status,
    ).toBe(422);
    const res = await post(
      promoRoute,
      `/v1/admin/catalog/variants/${SUCRE}/promotions`,
      body(650),
      { id: SUCRE },
    );
    expect(res.status).toBe(201);
    const v = res.body.variants[0];
    expect(v.current.promo).toMatchObject({ amount: 650, compareAt: 750 });

    const sucre = (await app()).bySlug.get('sucre-en-poudre');
    expect(sucre?.variants[0]).toMatchObject({ price: 650, compareAtPrice: 750 });
    expect(sucre?.badges).toContain('promotion');
    expect(sucre?.discountPercent).toBe(13);

    expect(
      (
        await post(promoRoute, `/v1/admin/catalog/variants/${SUCRE}/promotions`, body(600), {
          id: SUCRE,
        })
      ).status,
    ).toBe(422);

    const ended = await post(
      endPriceRoute,
      `/v1/admin/catalog/prices/${v.current.promo.id}/end`,
      undefined,
      { id: String(v.current.promo.id) },
    );
    expect(ended.body.variants[0].current).toMatchObject({ retail: 750, promo: null });
    const after = (await app()).bySlug.get('sucre-en-poudre');
    expect(after?.badges).not.toContain('promotion');
    expect(after?.variants[0]?.compareAtPrice).toBeNull();
  });

  it('impossible d’arrêter le seul prix public en vigueur', async () => {
    const detail = await get(productRoute, '/v1/admin/catalog/products/prd_0002', {
      id: 'prd_0002',
    });
    const current = detail.body.variants[0].prices.find(
      (p: { state: string; segment: string }) => p.state === 'current' && p.segment === 'retail',
    );
    const res = await post(endPriceRoute, `/v1/admin/catalog/prices/${current.id}/end`, undefined, {
      id: String(current.id),
    });
    expect(res.status).toBe(422);
  });
  it('arrêter un prix barré permanent rétablit le prix normal (le format garde un prix)', async () => {
    const RIZ_5KG = 'var_riz-parfume-savana_0'; // 4 750 F « au lieu de » 5 200 F, sans date de fin
    const detail = await get(productRoute, `/v1/admin/catalog/products/${RIZ}`, { id: RIZ });
    const v = detail.body.variants.find((x: { id: string }) => x.id === RIZ_5KG);
    expect(v.current.promo).toMatchObject({ amount: 4750, compareAt: 5200, endsAt: null });
    const res = await post(
      endPriceRoute,
      `/v1/admin/catalog/prices/${v.current.promo.id}/end`,
      undefined,
      {
        id: String(v.current.promo.id),
      },
    );
    const after = res.body.variants.find((x: { id: string }) => x.id === RIZ_5KG);
    expect(after.current).toMatchObject({ retail: 5200, promo: null });
    expect((await app()).bySlug.get('riz-parfume-savana')?.variants[0]).toMatchObject({
      price: 5200,
      compareAtPrice: null,
    });
  });
});

describe('stock', () => {
  const MAIS = 'var_mais-grain-blanc_0';

  it('réception, casse, inventaire : stock et historique', async () => {
    let res = await post(
      stockRoute,
      `/v1/admin/catalog/variants/${MAIS}/stock`,
      {
        agencyId: 'agc_lome_be',
        kind: 'add',
        quantity: 30,
        reason: 'reception',
        note: 'Livraison fournisseur',
      },
      { id: MAIS },
    );
    const be = () =>
      res.body.variants[0].stock.find((st: { agencyId: string }) => st.agencyId === 'agc_lome_be');
    expect(be()).toMatchObject({ onHand: 30, sellable: 30 });
    res = await post(
      stockRoute,
      `/v1/admin/catalog/variants/${MAIS}/stock`,
      { agencyId: 'agc_lome_be', kind: 'remove', quantity: 2, reason: 'loss' },
      { id: MAIS },
    );
    expect(be().onHand).toBe(28);
    res = await post(
      stockRoute,
      `/v1/admin/catalog/variants/${MAIS}/stock`,
      { agencyId: 'agc_lome_be', kind: 'set', quantity: 25, reason: 'inventory' },
      { id: MAIS },
    );
    expect(be().onHand).toBe(25);

    const history = await get(movementsRoute, `/v1/admin/catalog/variants/${MAIS}/movements`, {
      id: MAIS,
    });
    expect(
      history.body
        .slice(0, 3)
        .map((m: { reason: string; delta: number; onHandAfter: number }) => [
          m.reason,
          m.delta,
          m.onHandAfter,
        ]),
    ).toEqual([
      ['inventory', -3, 25],
      ['loss', -2, 28],
      ['reception', 30, 30],
    ]);
  });

  it('impossible de descendre sous le stock réservé par des commandes', async () => {
    const HUILE_5L = 'var_huile-vegetale-golfe-dor_1';
    await t.db
      .update(s.stockLevels)
      .set({ onHand: 10, reserved: 8 })
      .where(
        and(eq(s.stockLevels.variantId, HUILE_5L), eq(s.stockLevels.agencyId, 'agc_lome_centre')),
      );
    const res = await post(
      stockRoute,
      `/v1/admin/catalog/variants/${HUILE_5L}/stock`,
      { agencyId: 'agc_lome_centre', kind: 'set', quantity: 5, reason: 'inventory' },
      { id: HUILE_5L },
    );
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/8 unité\(s\) sont réservées/);
  });

  it('seuil d’alerte par agence', async () => {
    const res = await post(
      thresholdRoute,
      `/v1/admin/catalog/variants/${MAIS}/threshold`,
      { agencyId: 'agc_lome_be', lowThreshold: 40 },
      { id: MAIS },
    );
    expect(
      res.body.variants[0].stock.find((st: { agencyId: string }) => st.agencyId === 'agc_lome_be')
        .lowThreshold,
    ).toBe(40);
  });

  it('une commande remise au client crée un mouvement « vente »', async () => {
    await t.db.insert(s.customers).values({ id: 'usr_cat_vente', phone: '+22891555555' });
    await t.db.insert(s.quotes).values({
      id: 'qte_cat',
      customerId: 'usr_cat_vente',
      payload: {},
      total: 1,
      expiresAt: new Date(Date.now() + HOUR),
    });
    await t.db.insert(s.orders).values({
      id: 'ord_cat',
      orderNumber: 'AFS-CAT-1',
      customerId: 'usr_cat_vente',
      status: 'confirmed',
      fulfillment: 'pickup',
      fulfillmentSummary: 'Retrait',
      slot: {},
      paymentMethod: 'pay_at_agency',
      paymentStatus: 'pending',
      itemCount: 3,
      subtotal: 1,
      deliveryFee: 0,
      total: 1,
      quoteId: 'qte_cat',
    });
    await reserveStock(t.db, 'ord_cat', [{ variantId: MAIS, quantity: 3 }], 'agc_lome_centre');
    await closeReservations(t.db, 'ord_cat', 'consume', new Date());
    const history = await get(movementsRoute, `/v1/admin/catalog/variants/${MAIS}/movements`, {
      id: MAIS,
    });
    expect(history.body[0]).toMatchObject({
      reason: 'sale',
      delta: -3,
      actor: 'Commande AFS-CAT-1',
    });
  });
});

describe('rayons', () => {
  it('créer, modifier, réordonner, désactiver (et ses produits disparaissent de l’app)', async () => {
    const created = await post(createCategoryRoute, '/v1/admin/catalog/categories', {
      name: 'Petit-déjeuner',
      description: null,
      color: '#a8432f',
      isActive: true,
    });
    expect(created.status).toBe(201);
    const cat = created.body.at(-1);
    expect(cat).toMatchObject({ slug: 'petit-dejeuner', productCount: 0 });

    const moved = await post(
      moveCategoryRoute,
      `/v1/admin/catalog/categories/${cat.id}/move`,
      { direction: 'up' },
      { id: cat.id },
    );
    expect(moved.body.at(-2).id).toBe(cat.id);

    await patch(
      patchCategoryRoute,
      '/v1/admin/catalog/categories/cat_boissons',
      { name: 'Boissons', description: null, color: '#1f6f8b', isActive: false },
      { id: 'cat_boissons' },
    );
    const seen = await app();
    expect(seen.categories.map((c) => c.slug)).not.toContain('boissons');
    expect(seen.products.some((p) => p.categoryId === 'boissons')).toBe(false);
    await patch(
      patchCategoryRoute,
      '/v1/admin/catalog/categories/cat_boissons',
      { name: 'Boissons', description: null, color: '#1f6f8b', isActive: true },
      { id: 'cat_boissons' },
    );
  });
});

describe('droits et traçabilité', () => {
  it('rôle Commandes : consulte mais ne modifie pas', async () => {
    expect(
      (await get(productsRoute, '/v1/admin/catalog/products', undefined, 'orders')).status,
    ).toBe(200);
    expect(
      (await get(categoriesRoute, '/v1/admin/catalog/categories', undefined, 'orders')).status,
    ).toBe(200);
    const res = await post(
      pricesRoute,
      `/v1/admin/catalog/variants/${HUILE_1L}/prices`,
      { segment: 'retail', amount: 1 },
      { id: HUILE_1L },
      'orders',
    );
    expect(res.status).toBe(403);
  });

  it('chaque modification est dans le journal d’audit', async () => {
    const audit = await t.db
      .select()
      .from(s.auditLog)
      .where(eq(s.auditLog.actorId, 'adm_cat_catalog'));
    expect([...new Set(audit.map((a) => a.action))]).toEqual(
      expect.arrayContaining([
        'product.created',
        'product.updated',
        'variant.updated',
        'price.set',
        'promotion.created',
        'price.ended',
        'stock.moved',
        'category.created',
      ]),
    );
  });
});
