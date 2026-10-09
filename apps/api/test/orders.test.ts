import { DELIVERY_RULES, SEED_ADDRESS, mockOnboardingOptions, mockZones } from '@afrisime/fixtures';
import { type CartValidateLine, type QuoteRequestInput, buildDeliveryOptions } from '@afrisime/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as cancelRoute } from '@/app/v1/orders/[id]/cancel/route';
import { GET as orderRoute } from '@/app/v1/orders/[id]/route';
import { POST as createOrderRoute } from '@/app/v1/orders/route';
import { POST as createPaymentRoute } from '@/app/v1/payments/route';
import { POST as webhookRoute } from '@/app/v1/webhooks/payments/[provider]/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateCatalog } from '@/server/catalog/service';
import { createQuote, getDeliveryOptions } from '@/server/checkout/service';
import { createAddress } from '@/server/customers/addresses';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { resetEnvCache } from '@/server/env';
import { tick } from '@/server/jobs';
import { cancelOrder, createOrder, getOrder, listOrders, reorder } from '@/server/orders/service';
import { PAYMENT_DEADLINE_MS } from '@/server/orders/state';
import { signWebhook, SIGNATURE_HEADER } from '@/server/payments/provider';
import { createPayment, getPayment, handleWebhook } from '@/server/payments/service';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;

/**
 * Mardi 13 octobre 2037, 07:00 à Lomé : les créneaux du jour commencent à 08:00.
 * Date future volontaire : certaines routes testées utilisent l'heure réelle, qui doit rester
 * antérieure aux échéances (devis, délai de paiement) calculées à partir de NOW.
 */
const NOW = new Date('2037-10-13T07:00:00.000Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);
const RIZ_5KG = 'var_riz-parfume-savana_0'; // 4 750 F, stock non limité
const RIZ_50KG = 'var_riz-parfume-savana_2'; // 43 500 F, stock 5
const HUILE_1L = 'var_huile-vegetale-golfe-dor_0'; // 1 300 F

const line = (variantId: string, quantity: number, expectedUnitPrice: number): CartValidateLine => ({
  variantId,
  quantity,
  expectedUnitPrice,
  expectedAvailability: 'available',
});

beforeAll(async () => {
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
beforeEach(() => {
  delete process.env.ORDER_SIMULATION;
  resetEnvCache();
});

async function newCustomer(district = 'Tokoin') {
  const id = `usr_ord_${++seq}`;
  await t.db.insert(s.customers).values({ id, phone: `+2289${String(5000000 + seq).slice(-7)}` });
  const address = await createAddress(t.db, id, {
    label: 'Maison',
    recipientName: 'Ama Koffi',
    phone: '+22890112233',
    district,
    city: 'Lomé',
    landmark: 'Portail bleu',
    instructions: null,
    location: null,
    isDefault: true,
  });
  const { accessToken } = await createSession(t.db, id, null);
  return { customer: { id, segment: 'retail' }, address, token: accessToken };
}

async function firstSlot(customerId: string, addressId: string | null, kind: 'delivery' | 'pickup', now = NOW) {
  const o = await getDeliveryOptions(t.db, { id: customerId, segment: 'retail' }, addressId, now);
  const slots = kind === 'delivery' ? o.delivery!.slots : o.pickup.agencies[0]!.slots;
  return slots.find((x) => x.available)!.id;
}

async function quoteFor(
  c: Awaited<ReturnType<typeof newCustomer>>,
  overrides: Partial<QuoteRequestInput> = {},
  now = NOW,
) {
  const fulfillment = overrides.fulfillment ?? 'delivery';
  const request: QuoteRequestInput = {
    fulfillment,
    addressId: fulfillment === 'delivery' ? c.address.id : null,
    agencyId: fulfillment === 'pickup' ? 'agc_lome_centre' : null,
    slotId: overrides.slotId ?? (await firstSlot(c.customer.id, c.address.id, fulfillment, now)),
    paymentMethod: 'mixx',
    useCredit: false,
    lines: [line(RIZ_5KG, 2, 4750)],
    ...overrides,
  };
  return createQuote(t.db, c.customer, request, now);
}

const sellable = async (variantId: string) => {
  const rows = await t.db.select().from(s.stockLevels).where(eq(s.stockLevels.variantId, variantId));
  return rows.reduce((n, r) => n + r.onHand - r.reserved, 0);
};

describe('options de livraison et devis', () => {
  it('identiques aux règles du mode démo, avec les données de la base', async () => {
    const c = await newCustomer();
    const server = await getDeliveryOptions(t.db, c.customer, c.address.id, NOW);
    const zone = mockZones.find((z) => z.id === 'zone_1')!;
    const demo = buildDeliveryOptions({
      address: { ...SEED_ADDRESS, id: c.address.id },
      zone,
      agencies: mockOnboardingOptions.agencies,
      rules: DELIVERY_RULES,
      now: NOW,
    });
    expect(server).toEqual(demo);
  });

  it('devis : frais de zone, livraison offerte au-delà du seuil', async () => {
    const c = await newCustomer();
    expect(await quoteFor(c)).toMatchObject({ subtotal: 9500, deliveryFee: 500, total: 10000, fulfillmentSummary: 'Livraison · Maison — Tokoin' });
    const big = await quoteFor(c, { lines: [line(RIZ_5KG, 11, 4750)] });
    expect(big).toMatchObject({ subtotal: 52250, deliveryFee: 0, total: 52250 });
  });

  it.each([
    ['prix changé', { lines: [line(RIZ_5KG, 1, 4000)] }, 'CART_CHANGED'],
    ['minimum non atteint', { lines: [line(HUILE_1L, 1, 1300)] }, 'MIN_ORDER_NOT_MET'],
    ['créneau inconnu', { slotId: 'slot_d_zone_1_20200101_8' }, 'SLOT_UNAVAILABLE'],
    ['carte bancaire', { paymentMethod: 'card' as const }, 'PAYMENT_METHOD_UNAVAILABLE'],
    ['à la livraison au-delà du plafond', { paymentMethod: 'cash_on_delivery' as const, lines: [line(RIZ_50KG, 3, 43500)] }, 'PAYMENT_METHOD_UNAVAILABLE'],
  ])('refus : %s', async (_name, overrides, code) => {
    const c = await newCustomer();
    await expect(quoteFor(c, overrides)).rejects.toMatchObject({ code });
  });

  it('zone non desservie', async () => {
    const c = await newCustomer('Quartier inconnu');
    await expect(quoteFor(c, { slotId: 'x' })).rejects.toMatchObject({ code: 'ZONE_NOT_SERVED' });
  });
});

describe('commande', () => {
  it('Mobile Money : en attente de paiement, numéro lisible, stock réservé', async () => {
    const c = await newCustomer();
    const before = await sellable(RIZ_50KG);
    const q = await quoteFor(c, { lines: [line(RIZ_50KG, 2, 43500)] });
    const order = await createOrder(t.db, c.customer, q.quoteId, 'cle-commande-0001', NOW);
    expect(order).toMatchObject({
      status: 'pending_payment',
      payable: true,
      cancellable: true,
      itemCount: 2,
      total: q.total,
      payment: { method: 'mixx', status: 'initiated' },
      history: [{ status: 'pending_payment', note: 'En attente du paiement' }],
      paymentDeadline: at(PAYMENT_DEADLINE_MS).toISOString(),
    });
    expect(order.orderNumber).toMatch(/^AFS-\d{4}-\d{6}$/);
    expect(order.lines).toEqual(q.lines);
    expect(await sellable(RIZ_50KG)).toBe(before - 2);
  });

  it('retrait en agence payé sur place : confirmée tout de suite, avec code de retrait', async () => {
    const c = await newCustomer();
    const q = await quoteFor(c, { fulfillment: 'pickup', paymentMethod: 'pay_at_agency' });
    const order = await createOrder(t.db, c.customer, q.quoteId, 'cle-retrait-0001', NOW);
    expect(order).toMatchObject({ status: 'confirmed', payable: false, payment: { status: 'pending' }, fulfillmentSummary: 'Retrait · Agence Lomé Centre' });
    expect(order.pickupCode).toMatch(/^\d{6}$/);
  });

  it('même Idempotency-Key → même commande ; autre contenu → 409', async () => {
    const c = await newCustomer();
    const q = await quoteFor(c);
    const headers = { 'idempotency-key': 'cle-doublon-0001' };
    const post = (quoteId: string) =>
      call(createOrderRoute, 'POST', '/v1/orders', { token: c.token, body: { quoteId }, headers });
    const first = await post(q.quoteId);
    const again = await post(q.quoteId);
    expect(first.status).toBe(201);
    expect(again.body.id).toBe(first.body.id);
    expect(await t.db.$count(s.orders, eq(s.orders.customerId, c.customer.id))).toBe(1);
    const other = await quoteFor(c);
    expect((await post(other.quoteId)).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('sans Idempotency-Key → 400', async () => {
    const c = await newCustomer();
    const q = await quoteFor(c);
    const res = await call(createOrderRoute, 'POST', '/v1/orders', { token: c.token, body: { quoteId: q.quoteId } });
    expect(res.status).toBe(400);
  });

  it('devis expiré, déjà utilisé ou d’un autre client → QUOTE_EXPIRED', async () => {
    const c = await newCustomer();
    const other = await newCustomer();
    const q = await quoteFor(c);
    await expect(createOrder(t.db, c.customer, q.quoteId, 'cle-expire-0001', at(DELIVERY_RULES.quoteTtlMs + 1000))).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' });
    const q2 = await quoteFor(c);
    await expect(createOrder(t.db, other.customer, q2.quoteId, 'cle-autre-00001', NOW)).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' });
    await createOrder(t.db, c.customer, q2.quoteId, 'cle-unique-0001', NOW);
    await expect(createOrder(t.db, c.customer, q2.quoteId, 'cle-unique-0002', NOW)).rejects.toMatchObject({ code: 'QUOTE_EXPIRED' });
  });

  it('deux commandes pour le dernier stock : une seule passe', async () => {
    await t.db.update(s.stockLevels).set({ onHand: 1, reserved: 0 }).where(eq(s.stockLevels.variantId, 'var_mais-grain-blanc_1'));
    invalidateCatalog();
    const a = await newCustomer();
    const b = await newCustomer();
    const lines = [line('var_mais-grain-blanc_1', 1, 31000)];
    const qa = await quoteFor(a, { lines });
    const qb = await quoteFor(b, { lines });
    const results = await Promise.allSettled([
      createOrder(t.db, a.customer, qa.quoteId, 'cle-dernier-000a', NOW),
      createOrder(t.db, b.customer, qb.quoteId, 'cle-dernier-000b', NOW),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'OUT_OF_STOCK' } });
    expect(await sellable('var_mais-grain-blanc_1')).toBe(0);
  });

  it("impossible de voir ou d'annuler la commande d'un autre client (404)", async () => {
    const c = await newCustomer();
    const other = await newCustomer();
    const q = await quoteFor(c);
    const order = await createOrder(t.db, c.customer, q.quoteId, 'cle-isole-00001', NOW);
    const params = { id: order.id };
    expect((await call(orderRoute, 'GET', `/v1/orders/${order.id}`, { token: other.token, params })).status).toBe(404);
    const cancel = await call(cancelRoute, 'POST', `/v1/orders/${order.id}/cancel`, { token: other.token, params, body: { reason: null } });
    expect(cancel.status).toBe(404);
  });
});

describe('paiement Mobile Money (simulé)', () => {
  async function pendingOrder(key: string) {
    const c = await newCustomer();
    const q = await quoteFor(c);
    const order = await createOrder(t.db, c.customer, q.quoteId, key, NOW);
    return { c, order };
  }

  it('confirmé : la commande passe en « confirmée »', async () => {
    const { c, order } = await pendingOrder('cle-paiement-ok1');
    const intent = await createPayment(t.db, c.customer.id, { orderId: order.id, method: 'flooz', phone: '+22899000001' }, 'cle-pay-ok-00001', NOW);
    expect(intent).toMatchObject({ status: 'pending', amount: order.total, action: { type: 'confirm_on_phone' } });
    expect((await getPayment(t.db, c.customer.id, intent.id, at(2000))).status).toBe('pending');
    expect((await getPayment(t.db, c.customer.id, intent.id, at(6000))).status).toBe('succeeded');
    const paid = await getOrder(t.db, c.customer.id, order.id, at(6000));
    expect(paid).toMatchObject({ status: 'confirmed', payable: false, payment: { method: 'flooz', status: 'succeeded' } });
    expect(paid.history.at(-1)).toMatchObject({ status: 'confirmed', note: 'Paiement Moov Money (Flooz) reçu' });
  });

  it('refusé (…0002), puis nouvelle tentative réussie', async () => {
    const { c, order } = await pendingOrder('cle-paiement-ko1');
    const failed = await createPayment(t.db, c.customer.id, { orderId: order.id, method: 'mixx', phone: '+22890000002' }, 'cle-pay-ko-00001', NOW);
    expect((await getPayment(t.db, c.customer.id, failed.id, at(5000))).status).toBe('failed');
    const after = await getOrder(t.db, c.customer.id, order.id, at(5000));
    expect(after).toMatchObject({ status: 'payment_failed', payable: true, payment: { status: 'failed' } });

    const retry = await createPayment(t.db, c.customer.id, { orderId: order.id, method: 'mixx', phone: '+22890000009' }, 'cle-pay-ko-00002', at(10_000));
    expect((await getPayment(t.db, c.customer.id, retry.id, at(16_000))).status).toBe('succeeded');
    expect((await getOrder(t.db, c.customer.id, order.id, at(16_000))).status).toBe('confirmed');
  });

  it('jamais deux débits en cours : la tentative active est renvoyée', async () => {
    const { c, order } = await pendingOrder('cle-paiement-dbl');
    const one = await createPayment(t.db, c.customer.id, { orderId: order.id, method: 'mixx', phone: '+22890000009' }, 'cle-pay-dbl-0001', NOW);
    const two = await createPayment(t.db, c.customer.id, { orderId: order.id, method: 'mixx', phone: '+22890000009' }, 'cle-pay-dbl-0002', at(1000));
    expect(two.id).toBe(one.id);
  });

  it('commande non payée à temps : annulée et stock libéré', async () => {
    const before = await sellable(RIZ_50KG);
    const c = await newCustomer();
    const q = await quoteFor(c, { lines: [line(RIZ_50KG, 1, 43500)] });
    const order = await createOrder(t.db, c.customer, q.quoteId, 'cle-delai-00001', NOW);
    expect(await sellable(RIZ_50KG)).toBe(before - 1);
    const late = await getOrder(t.db, c.customer.id, order.id, at(PAYMENT_DEADLINE_MS + 1000));
    expect(late).toMatchObject({ status: 'cancelled', payable: false, cancellable: false });
    expect(late.history.at(-1)?.note).toBe('Annulée : paiement non reçu à temps');
    expect(await sellable(RIZ_50KG)).toBe(before);
  });

  it('paiement reçu après l’annulation : remboursé automatiquement', async () => {
    const { c, order } = await pendingOrder('cle-paie-tard01');
    const intent = await createPayment(t.db, c.customer.id, { orderId: order.id, method: 'mixx', phone: '+22890000009' }, 'cle-pay-tard-001', NOW);
    await cancelOrder(t.db, c.customer.id, order.id, null, at(1000));
    expect((await getPayment(t.db, c.customer.id, intent.id, at(6000))).status).toBe('refunded');
    expect((await getOrder(t.db, c.customer.id, order.id, at(6000))).status).toBe('refunded');
  });

  it('webhook signé : traité une seule fois ; signature falsifiée refusée', async () => {
    const { c, order } = await pendingOrder('cle-webhook-001');
    const intent = await createPayment(t.db, c.customer.id, { orderId: order.id, method: 'mixx', phone: '+22890000003' }, 'cle-pay-wh-00001', NOW);
    const raw = JSON.stringify({ eventId: 'evt_1', reference: `sim_${intent.id}`, status: 'succeeded' });
    const send = (signature: string) =>
      webhookRoute(
        new Request('http://localhost/v1/webhooks/payments/simulated', { method: 'POST', body: raw, headers: { [SIGNATURE_HEADER]: signature } }),
        { params: Promise.resolve({ provider: 'simulated' }) },
      );
    expect((await send('faux')).status).toBe(403);
    expect((await send(signWebhook(raw))).status).toBe(200);
    expect((await send(signWebhook(raw))).status).toBe(200);
    expect(await t.db.$count(s.webhookEvents, eq(s.webhookEvents.eventId, 'evt_1'))).toBe(1);
    const events = await t.db
      .select()
      .from(s.orderStatusEvents)
      .where(and(eq(s.orderStatusEvents.orderId, order.id), eq(s.orderStatusEvents.status, 'confirmed')));
    expect(events).toHaveLength(1);
    expect(await handleWebhook(t.db, 'simulated', raw, new Headers())).toBe(false);
  });

  it('paiement via la route : Idempotency-Key obligatoire, rejouable', async () => {
    const { c, order } = await pendingOrder('cle-route-pay01');
    const body = { orderId: order.id, method: 'mixx', phone: '+22890000009' };
    expect((await call(createPaymentRoute, 'POST', '/v1/payments', { token: c.token, body })).status).toBe(400);
    const headers = { 'idempotency-key': 'cle-route-pay-key1' };
    const first = await call(createPaymentRoute, 'POST', '/v1/payments', { token: c.token, body, headers });
    const again = await call(createPaymentRoute, 'POST', '/v1/payments', { token: c.token, body, headers });
    expect(first.status).toBe(201);
    expect(again.body.id).toBe(first.body.id);
  });
});

describe('annulation, suivi, recommande', () => {
  it('annuler une commande payée : remboursée, stock libéré', async () => {
    const c = await newCustomer();
    const before = await sellable(RIZ_50KG);
    const q = await quoteFor(c, { lines: [line(RIZ_50KG, 1, 43500)] });
    const order = await createOrder(t.db, c.customer, q.quoteId, 'cle-annule-0001', NOW);
    const p = await createPayment(t.db, c.customer.id, { orderId: order.id, method: 'mixx', phone: '+22890000009' }, 'cle-annule-pay01', NOW);
    await getPayment(t.db, c.customer.id, p.id, at(6000));
    const cancelled = await cancelOrder(t.db, c.customer.id, order.id, 'Erreur de quantité', at(7000));
    expect(cancelled).toMatchObject({ status: 'refunded', cancellable: false, payment: { status: 'refunded' } });
    expect(cancelled.history.map((h) => h.status).slice(-2)).toEqual(['cancelled', 'refunded']);
    expect(await sellable(RIZ_50KG)).toBe(before);
  });

  it('en préparation : annulation refusée', async () => {
    process.env.ORDER_SIMULATION = 'true';
    resetEnvCache();
    const c = await newCustomer();
    const q = await quoteFor(c, { paymentMethod: 'cash_on_delivery' });
    const order = await createOrder(t.db, c.customer, q.quoteId, 'cle-prepa-00001', NOW);
    await expect(cancelOrder(t.db, c.customer.id, order.id, null, at(3 * 60_000))).rejects.toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
  });

  it('simulation (développement) : préparée, en route, livrée ; payée à la livraison ; stock consommé', async () => {
    process.env.ORDER_SIMULATION = 'true';
    resetEnvCache();
    const c = await newCustomer();
    const onHand = async () => (await t.db.select().from(s.stockLevels).where(eq(s.stockLevels.variantId, RIZ_50KG)))[0]!.onHand;
    const before = await onHand();
    const q = await quoteFor(c, { paymentMethod: 'cash_on_delivery', lines: [line(RIZ_50KG, 1, 43500)] });
    const order = await createOrder(t.db, c.customer, q.quoteId, 'cle-simu-000001', NOW);
    expect((await getOrder(t.db, c.customer.id, order.id, at(3 * 60_000))).status).toBe('preparing');
    expect((await getOrder(t.db, c.customer.id, order.id, at(6 * 60_000))).status).toBe('out_for_delivery');
    const done = await getOrder(t.db, c.customer.id, order.id, at(11 * 60_000));
    expect(done).toMatchObject({ status: 'delivered', payment: { status: 'succeeded' } });
    expect(done.history.map((h) => h.status)).toEqual(['confirmed', 'preparing', 'out_for_delivery', 'delivered']);
    expect(await onHand()).toBe(before - 1);
  });

  it('sans simulation, une commande confirmée ne bouge pas seule', async () => {
    const c = await newCustomer();
    const q = await quoteFor(c, { paymentMethod: 'cash_on_delivery' });
    const order = await createOrder(t.db, c.customer, q.quoteId, 'cle-fixe-000001', NOW);
    expect((await getOrder(t.db, c.customer.id, order.id, at(60 * 60_000))).status).toBe('confirmed');
  });

  it('listes « en cours » et « historique »', async () => {
    const c = await newCustomer();
    const q1 = await quoteFor(c, { paymentMethod: 'cash_on_delivery' });
    const kept = await createOrder(t.db, c.customer, q1.quoteId, 'cle-liste-00001', NOW);
    const q2 = await quoteFor(c, { paymentMethod: 'cash_on_delivery' });
    const gone = await createOrder(t.db, c.customer, q2.quoteId, 'cle-liste-00002', NOW);
    await cancelOrder(t.db, c.customer.id, gone.id, null, NOW);
    const active = await listOrders(t.db, c.customer.id, 'active', undefined, NOW);
    const history = await listOrders(t.db, c.customer.id, 'history', undefined, NOW);
    expect(active.items.map((o) => o.id)).toEqual([kept.id]);
    expect(history.items.map((o) => o.id)).toEqual([gone.id]);
  });

  it('recommande : articles aux prix du jour', async () => {
    const c = await newCustomer();
    const q = await quoteFor(c);
    const order = await createOrder(t.db, c.customer, q.quoteId, 'cle-recom-00001', NOW);
    const res = await reorder(t.db, c.customer, order.id);
    expect(res.lines).toEqual([expect.objectContaining({ variantId: RIZ_5KG, quantity: 2, unitPrice: 4750, status: 'ok' })]);
  });

  it('tâche planifiée : rattrape un paiement et annule les commandes en retard', async () => {
    const { c, order } = await (async () => {
      const cust = await newCustomer();
      const qq = await quoteFor(cust);
      return { c: cust, order: await createOrder(t.db, cust.customer, qq.quoteId, 'cle-tick-000001', NOW) };
    })();
    await createPayment(t.db, c.customer.id, { orderId: order.id, method: 'mixx', phone: '+22890000009' }, 'cle-tick-pay0001', NOW);
    const result = await tick(t.db, at(20_000));
    expect(result.paymentsChecked).toBeGreaterThanOrEqual(1);
    const [row] = await t.db.select().from(s.orders).where(eq(s.orders.id, order.id));
    expect(row?.status).toBe('confirmed');
  });
});
