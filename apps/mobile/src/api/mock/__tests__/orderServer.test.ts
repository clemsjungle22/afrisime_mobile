import type { Quote } from '@afrisime/shared';
import { ApiError } from '@/api/errors';
import { mockProducts, mockStock } from '../data/products';
import { loadDb, resetMockDb } from '../db';
import {
  PAYMENT_CONFIRM_MS,
  PAYMENT_DEADLINE_MS,
  PAYMENT_TTL_MS,
  cancelOrder,
  createOrder,
  createPayment,
  getOrder,
  getPayment,
  listOrders,
  registerQuote,
  reorder,
  resetOrderServer,
} from '../orderServer';

const USER = 'usr_kossi';
const T0 = Date.parse('2026-10-07T10:00:00.000Z');
let quoteSeq = 0;

function makeQuote(paymentMethod: Quote['paymentMethod'], fulfillment: Quote['fulfillment'] = 'delivery'): Quote {
  const quote: Quote = {
    quoteId: `qte_${quoteSeq++}`,
    expiresAt: new Date(T0 + 15 * 60_000).toISOString(),
    fulfillment,
    addressId: fulfillment === 'delivery' ? 'adr_kossi_maison' : null,
    agencyId: fulfillment === 'pickup' ? 'agc_lome_centre' : null,
    slot: { id: 's', start: '2026-10-07T12:00:00.000Z', end: '2026-10-07T16:00:00.000Z', available: true, remaining: null },
    paymentMethod,
    lines: [
      {
        variantId: 'var_riz-parfume-savana_0',
        productSlug: 'riz-parfume-savana',
        productName: 'Riz parfumé long grain',
        brand: 'Savana',
        variantLabel: 'Sac 5 kg',
        imageUrl: null,
        color: '#b7862b',
        availability: 'available',
        leadTimeDays: null,
        minQuantity: 1,
        maxQuantity: null,
        unitPrice: 4750,
        requestedQuantity: 2,
        quantity: 2,
        lineTotal: 9500,
        status: 'ok',
      },
    ],
    subtotal: 9500,
    deliveryFee: 500,
    discountTotal: 0,
    total: 10000,
    currency: 'XOF',
    fulfillmentSummary: 'Livraison · Maison — Tokoin',
  };
  registerQuote(USER, quote);
  return quote;
}

async function rejection(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('aurait dû échouer');
}

beforeEach(() => {
  resetMockDb();
  resetOrderServer();
});

describe('création de commande', () => {
  it('Mobile Money : en attente de paiement, numéro lisible, délai de paiement', async () => {
    const q = makeQuote('mixx');
    const order = await createOrder(USER, { quoteId: q.quoteId }, 'k1', T0);
    expect(order).toMatchObject({ status: 'pending_payment', payable: true, total: 10000 });
    expect(order.orderNumber).toBe('AFS-2026-000123');
    expect(Date.parse(order.paymentDeadline!)).toBe(T0 + PAYMENT_DEADLINE_MS);
  });

  it('paiement à la livraison : confirmée directement', async () => {
    const order = await createOrder(USER, { quoteId: makeQuote('cash_on_delivery').quoteId }, 'k1', T0);
    expect(order).toMatchObject({ status: 'confirmed', payable: false });
  });

  it('retrait en agence : code de retrait à 6 chiffres', async () => {
    const order = await createOrder(USER, { quoteId: makeQuote('pay_at_agency', 'pickup').quoteId }, 'k1', T0);
    expect(order.pickupCode).toMatch(/^\d{6}$/);
  });

  it('idempotence : même clé = même commande (double tap, reconnexion)', async () => {
    const q = makeQuote('mixx');
    const a = await createOrder(USER, { quoteId: q.quoteId }, 'same-key', T0);
    const b = await createOrder(USER, { quoteId: q.quoteId }, 'same-key', T0 + 1000);
    expect(b.id).toBe(a.id);
    expect((await loadDb()).orders[USER]).toHaveLength(1);
  });

  it('même clé, autre contenu → 409', async () => {
    await createOrder(USER, { quoteId: makeQuote('mixx').quoteId }, 'k', T0);
    expect(await rejection(createOrder(USER, { quoteId: makeQuote('mixx').quoteId }, 'k', T0))).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      status: 409,
    });
  });

  it('devis expiré ou déjà utilisé', async () => {
    const q = makeQuote('mixx');
    expect(await rejection(createOrder(USER, { quoteId: q.quoteId }, 'k1', T0 + 16 * 60_000))).toMatchObject({
      code: 'QUOTE_EXPIRED',
    });
    const q2 = makeQuote('mixx');
    await createOrder(USER, { quoteId: q2.quoteId }, 'k2', T0);
    expect(await rejection(createOrder(USER, { quoteId: q2.quoteId }, 'k3', T0))).toMatchObject({ code: 'QUOTE_EXPIRED' });
  });

  it('clé d’idempotence obligatoire', async () => {
    expect(await rejection(createOrder(USER, { quoteId: makeQuote('mixx').quoteId }, undefined, T0))).toMatchObject({
      status: 400,
    });
  });
});

describe('paiement Mobile Money', () => {
  async function pendingOrder() {
    return createOrder(USER, { quoteId: makeQuote('mixx').quoteId }, `k${quoteSeq}`, T0);
  }

  it('succès : en attente puis confirmé par le « serveur », commande confirmée', async () => {
    const order = await pendingOrder();
    const intent = await createPayment(USER, { orderId: order.id, method: 'mixx', phone: '+22890123456' }, 'p1', T0);
    expect(intent).toMatchObject({ status: 'pending', amount: 10000, action: { type: 'confirm_on_phone' } });
    expect((await getPayment(USER, intent.id, T0 + 1000)).status).toBe('pending');
    expect((await getPayment(USER, intent.id, T0 + PAYMENT_CONFIRM_MS)).status).toBe('succeeded');
    const confirmed = await getOrder(USER, order.id, T0 + PAYMENT_CONFIRM_MS);
    expect(confirmed).toMatchObject({ status: 'confirmed', payable: false, payment: { status: 'succeeded' } });
  });

  it('échec (…0002) : commande en échec de paiement, toujours payable', async () => {
    const order = await pendingOrder();
    const intent = await createPayment(USER, { orderId: order.id, method: 'flooz', phone: '+22890120002' }, 'p1', T0);
    expect(await getPayment(USER, intent.id, T0 + 10_000)).toMatchObject({ status: 'failed', failureReason: expect.any(String) });
    expect(await getOrder(USER, order.id, T0 + 10_000)).toMatchObject({ status: 'payment_failed', payable: true });
  });

  it('expiration (…0003)', async () => {
    const order = await pendingOrder();
    const intent = await createPayment(USER, { orderId: order.id, method: 'mixx', phone: '+22890120003' }, 'p1', T0);
    expect((await getPayment(USER, intent.id, T0 + 30_000)).status).toBe('pending');
    expect((await getPayment(USER, intent.id, T0 + PAYMENT_TTL_MS)).status).toBe('expired');
  });

  it('RB-003 : une tentative en cours est renvoyée, jamais deux débits simultanés', async () => {
    const order = await pendingOrder();
    const a = await createPayment(USER, { orderId: order.id, method: 'mixx', phone: '+22890123456' }, 'p1', T0);
    const b = await createPayment(USER, { orderId: order.id, method: 'mixx', phone: '+22890123456' }, 'p2', T0 + 1000);
    expect(b.id).toBe(a.id);
  });

  it('issue figée une seule fois (webhook idempotent)', async () => {
    const order = await pendingOrder();
    const intent = await createPayment(USER, { orderId: order.id, method: 'mixx', phone: '+22890123456' }, 'p1', T0);
    await getPayment(USER, intent.id, T0 + PAYMENT_CONFIRM_MS);
    await getPayment(USER, intent.id, T0 + PAYMENT_CONFIRM_MS + 1000);
    const confirmedEvents = (await getOrder(USER, order.id, T0 + PAYMENT_CONFIRM_MS + 2000)).history.filter(
      (e) => e.status === 'confirmed',
    );
    expect(confirmedEvents).toHaveLength(1);
  });

  it('commande non payable (déjà confirmée) → refus', async () => {
    const order = await createOrder(USER, { quoteId: makeQuote('cash_on_delivery').quoteId }, 'k', T0);
    expect(
      await rejection(createPayment(USER, { orderId: order.id, method: 'mixx', phone: '+22890123456' }, 'p', T0)),
    ).toMatchObject({ code: 'ORDER_NOT_PAYABLE' });
  });
});

describe('cycle de vie', () => {
  it('progression simulée puis passage à l’historique', async () => {
    const order = await createOrder(USER, { quoteId: makeQuote('cash_on_delivery').quoteId }, 'k', T0);
    expect((await getOrder(USER, order.id, T0 + 3 * 60_000)).status).toBe('preparing');
    expect((await getOrder(USER, order.id, T0 + 6 * 60_000)).status).toBe('out_for_delivery');
    expect((await getOrder(USER, order.id, T0 + 11 * 60_000)).status).toBe('delivered');
    expect(await listOrders(USER, 'active', T0 + 11 * 60_000)).toHaveLength(0);
    expect(await listOrders(USER, 'history', T0 + 11 * 60_000)).toHaveLength(1);
  });

  it('non payée à temps → annulée automatiquement', async () => {
    const order = await createOrder(USER, { quoteId: makeQuote('mixx').quoteId }, 'k', T0);
    expect(await getOrder(USER, order.id, T0 + PAYMENT_DEADLINE_MS + 1)).toMatchObject({ status: 'cancelled', payable: false });
  });

  it('annulation : possible si confirmée, refusée en préparation (RB-009)', async () => {
    const a = await createOrder(USER, { quoteId: makeQuote('cash_on_delivery').quoteId }, 'k1', T0);
    expect(await cancelOrder(USER, a.id, T0 + 1000)).toMatchObject({ status: 'cancelled', cancellable: false });

    const b = await createOrder(USER, { quoteId: makeQuote('cash_on_delivery').quoteId }, 'k2', T0);
    expect(await rejection(cancelOrder(USER, b.id, T0 + 3 * 60_000))).toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
  });

  it('annulation d’une commande payée → remboursement', async () => {
    const order = await createOrder(USER, { quoteId: makeQuote('mixx').quoteId }, 'k', T0);
    const intent = await createPayment(USER, { orderId: order.id, method: 'mixx', phone: '+22890123456' }, 'p', T0);
    await getPayment(USER, intent.id, T0 + PAYMENT_CONFIRM_MS);
    const cancelled = await cancelOrder(USER, order.id, T0 + PAYMENT_CONFIRM_MS + 1000);
    expect(cancelled).toMatchObject({ status: 'refunded', payment: { status: 'refunded' } });
  });

  it('commander à nouveau : lignes revalidées aux prix actuels', async () => {
    const order = await createOrder(USER, { quoteId: makeQuote('cash_on_delivery').quoteId }, 'k', T0);
    const res = await reorder(USER, order.id, { products: mockProducts, stock: mockStock });
    expect(res.lines).toEqual([expect.objectContaining({ variantId: 'var_riz-parfume-savana_0', quantity: 2, status: 'ok' })]);
  });
});
