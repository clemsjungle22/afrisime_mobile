import { mockProducts, mockStock, productSeeds } from '@afrisime/fixtures';
import { OrderStatus, PaymentMethodId, PaymentStatus } from '@afrisime/shared';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeAvailability } from '@/server/catalog/availability';
import * as s from '@/server/db/schema';
import { UNLIMITED_DEMO_STOCK, seedDatabase } from '@/server/db/seed';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.close();
});

const count = (table: Parameters<typeof t.db.$count>[0]) => t.db.$count(table);

describe('migrations', () => {
  it('créent toutes les tables', async () => {
    const res = await t.client.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    expect(res.rows[0]?.n).toBe(25);
  });

  it('les énumérations de la base suivent le contrat partagé', () => {
    expect(s.orderStatus.enumValues).toEqual(OrderStatus.options);
    expect(s.paymentStatus.enumValues).toEqual(PaymentStatus.options);
    expect(s.paymentMethod.enumValues).toEqual(PaymentMethodId.options);
  });
});

describe('seed', () => {
  it("charge les données d'exemple", async () => {
    const counts = await seedDatabase(t.db);
    const variants = productSeeds.reduce((n, p) => n + p.variants.length, 0);
    expect(await count(s.categories)).toBe(6);
    expect(await count(s.products)).toBe(productSeeds.length);
    expect(await count(s.productVariants)).toBe(variants);
    expect(await count(s.stockLevels)).toBe(variants);
    expect(await count(s.prices)).toBe(counts.prices);
    expect(await count(s.deliveryZones)).toBe(3);
    expect(await count(s.customers)).toBe(1);
  });

  it('est rejouable sans doublon', async () => {
    const before = await count(s.prices);
    await seedDatabase(t.db);
    expect(await count(s.prices)).toBe(before);
    expect(await count(s.products)).toBe(productSeeds.length);
    expect(await count(s.addresses)).toBe(1);
  });

  it("garde les mêmes identifiants et prix que le mode démo de l'app", async () => {
    const rows = await t.db
      .select({ id: s.productVariants.id, amount: s.prices.amount, compareAt: s.prices.compareAtAmount })
      .from(s.productVariants)
      .leftJoin(s.prices, eq(s.prices.variantId, s.productVariants.id));
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const p of mockProducts) {
      for (const v of p.variants) {
        expect(byId.has(v.id)).toBe(true);
        expect(byId.get(v.id)?.amount ?? null).toBe(v.price);
        expect(byId.get(v.id)?.compareAt ?? null).toBe(v.compareAtPrice);
      }
    }
  });

  it("la disponibilité calculée en base est celle de l'app", async () => {
    const rows = await t.db
      .select({
        id: s.productVariants.id,
        saleMode: s.productVariants.saleMode,
        onHand: s.stockLevels.onHand,
        reserved: s.stockLevels.reserved,
      })
      .from(s.productVariants)
      .innerJoin(s.stockLevels, eq(s.stockLevels.variantId, s.productVariants.id));
    const computed = new Map(rows.map((r) => [r.id, computeAvailability(r.saleMode, r.onHand, r.reserved)]));
    for (const p of mockProducts) for (const v of p.variants) expect(computed.get(v.id)).toBe(v.availability);

    const limited = rows.filter((r) => mockStock.has(r.id));
    expect(limited.length).toBeGreaterThan(0);
    for (const r of limited) expect(r.onHand).toBe(mockStock.get(r.id));
    expect(rows.some((r) => r.onHand === UNLIMITED_DEMO_STOCK)).toBe(true);
  });

  it('la séquence des numéros de commande démarre à 123', async () => {
    const res = await t.client.query<{ n: string }>("select nextval('order_number_seq')::text as n");
    expect(res.rows[0]?.n).toBe('123');
  });

  it('une référence de paiement prestataire ne peut être enregistrée qu’une fois', async () => {
    await t.db
      .insert(s.quotes)
      .values({ id: 'quo_t', customerId: 'usr_kossi', payload: {}, total: 1300, expiresAt: new Date(Date.now() + 60_000) });
    await t.db.insert(s.orders).values({
      id: 'ord_t',
      orderNumber: 'AFS-TEST-1',
      customerId: 'usr_kossi',
      status: 'pending_payment',
      fulfillment: 'pickup',
      fulfillmentSummary: 'Retrait',
      slot: {},
      paymentMethod: 'mixx',
      paymentStatus: 'initiated',
      itemCount: 1,
      subtotal: 1300,
      deliveryFee: 0,
      total: 1300,
      quoteId: 'quo_t',
    });
    const payment = (id: string) => ({
      id,
      orderId: 'ord_t',
      provider: 'simulated',
      providerReference: 'REF-1',
      method: 'mixx' as const,
      amount: 1300,
      status: 'pending' as const,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await t.db.insert(s.payments).values(payment('pay_1'));
    await expect(t.db.insert(s.payments).values(payment('pay_2'))).rejects.toThrow();
    expect(await t.db.$count(s.payments, sql`true`)).toBe(1);
  });
});

describe('computeAvailability', () => {
  it('le mode de vente prime, puis le stock vendable', () => {
    expect(computeAvailability('quote_only', 0, 0)).toBe('quote_only');
    expect(computeAvailability('on_order', 0, 0)).toBe('on_order');
    expect(computeAvailability('standard', 5, 5)).toBe('unavailable');
    expect(computeAvailability('standard', 5, 4)).toBe('available');
  });
});
