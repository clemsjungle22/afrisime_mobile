import type { AdminRole, CartValidateLine, PaymentMethodId } from '@afrisime/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as cancelRoute } from '@/app/v1/admin/orders/[id]/cancel/route';
import { POST as collectRoute } from '@/app/v1/admin/orders/[id]/collect/route';
import { POST as notesRoute } from '@/app/v1/admin/orders/[id]/notes/route';
import { GET as detailRoute } from '@/app/v1/admin/orders/[id]/route';
import { POST as transitionRoute } from '@/app/v1/admin/orders/[id]/transition/route';
import { GET as listRoute } from '@/app/v1/admin/orders/route';
import { login } from '@/server/admin/auth';
import { hashPassword } from '@/server/admin/crypto';
import { invalidateCatalog } from '@/server/catalog/service';
import { createQuote, getDeliveryOptions } from '@/server/checkout/service';
import { createAddress } from '@/server/customers/addresses';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { createOrder, getOrder } from '@/server/orders/service';
import { createPayment, getPayment } from '@/server/payments/service';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;
const PASSWORD = 'mot-de-passe-equipe-2026';
const tokens: Partial<Record<AdminRole, string>> = {};
const RIZ_50KG = 'var_riz-parfume-savana_2'; // 43 500 F, stock limité

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  invalidateCatalog();
  const hash = await hashPassword(PASSWORD);
  for (const role of ['admin', 'orders', 'support', 'readonly', 'catalog'] as AdminRole[]) {
    const email = `${role}@equipe.test`;
    // 2FA non activé ici (déjà testé ailleurs) : on ouvre la session directement.
    await t.db
      .insert(s.adminUsers)
      .values({
        id: `adm_${role}`,
        email,
        name: `Équipe ${role}`,
        role: role === 'admin' ? 'orders' : role,
        passwordHash: hash,
        mustChangePassword: false,
      });
    if (role === 'admin')
      await t.db
        .update(s.adminUsers)
        .set({ role: 'admin' })
        .where(eq(s.adminUsers.id, 'adm_admin'));
    const res =
      role === 'admin'
        ? await adminSession(email)
        : await login(t.db, { email, password: PASSWORD }, { ip: '1.1.1.1', userAgent: null });
    tokens[role] = (res as { token: string }).token;
  }
});
afterAll(async () => {
  setDb(null);
  invalidateCatalog();
  await t.close();
});

/** Session administrateur sans passer par le 2FA (déjà testé dans admin.test.ts). */
async function adminSession(email: string) {
  await t.db.update(s.adminUsers).set({ role: 'orders' }).where(eq(s.adminUsers.email, email));
  const res = await login(t.db, { email, password: PASSWORD }, { ip: '1.1.1.1', userAgent: null });
  await t.db.update(s.adminUsers).set({ role: 'admin' }).where(eq(s.adminUsers.email, email));
  return res;
}

const line = (variantId: string, quantity: number, price: number): CartValidateLine => ({
  variantId,
  quantity,
  expectedUnitPrice: price,
  expectedAvailability: 'available',
});

/** Commande passée par un client, comme depuis l'app. */
async function customerOrder(
  options: {
    fulfillment?: 'delivery' | 'pickup';
    payment?: PaymentMethodId;
    lines?: CartValidateLine[];
    name?: string;
  } = {},
) {
  const id = `usr_bo_${++seq}`;
  await t.db
    .insert(s.customers)
    .values({
      id,
      phone: `+2289${String(7000000 + seq).slice(-7)}`,
      firstName: options.name ?? 'Afi',
      lastName: `Client${seq}`,
    });
  const address = await createAddress(t.db, id, {
    label: 'Maison',
    recipientName: 'Afi',
    phone: '+22890112233',
    district: 'Tokoin',
    city: 'Lomé',
    landmark: 'Portail bleu',
    instructions: 'Appeler en arrivant',
    location: { latitude: 6.14, longitude: 1.22, accuracy: 10 },
    isDefault: true,
  });
  const customer = { id, segment: 'retail' };
  const fulfillment = options.fulfillment ?? 'delivery';
  const opts = await getDeliveryOptions(t.db, customer, address.id);
  const slots = fulfillment === 'delivery' ? opts.delivery!.slots : opts.pickup.agencies[0]!.slots;
  const quote = await createQuote(t.db, customer, {
    fulfillment,
    addressId: fulfillment === 'delivery' ? address.id : null,
    agencyId: fulfillment === 'pickup' ? 'agc_lome_centre' : null,
    slotId: slots.find((x) => x.available)!.id,
    paymentMethod:
      options.payment ?? (fulfillment === 'delivery' ? 'cash_on_delivery' : 'pay_at_agency'),
    useCredit: false,
    lines: options.lines ?? [line('var_riz-parfume-savana_0', 2, 4750)],
  });
  const order = await createOrder(t.db, customer, quote.quoteId, `cle-bo-${seq}-xxxxxx`);
  return { customer, order };
}

const as = (role: AdminRole) => ({ token: tokens[role]! });
const detail = (id: string, role: AdminRole = 'orders') =>
  call(detailRoute, 'GET', `/v1/admin/orders/${id}`, { ...as(role), params: { id } });
const act = (id: string, body: object, role: AdminRole = 'orders') =>
  call(transitionRoute, 'POST', `/v1/admin/orders/${id}/transition`, {
    ...as(role),
    params: { id },
    body,
  });
const collect = (id: string, body: object, role: AdminRole = 'orders') =>
  call(collectRoute, 'POST', `/v1/admin/orders/${id}/collect`, {
    ...as(role),
    params: { id },
    body,
  });
const cancel = (id: string, body: object, role: AdminRole = 'orders') =>
  call(cancelRoute, 'POST', `/v1/admin/orders/${id}/cancel`, { ...as(role), params: { id }, body });

const onHand = async (variantId: string) =>
  (
    await t.db
      .select()
      .from(s.stockLevels)
      .where(
        and(eq(s.stockLevels.variantId, variantId), eq(s.stockLevels.agencyId, 'agc_lome_centre')),
      )
  )[0]!;

describe('parcours complets', () => {
  it('livraison payée à la livraison : préparation → livreur → encaissement → livrée ; le client voit chaque étape', async () => {
    const { customer, order } = await customerOrder({ lines: [line(RIZ_50KG, 1, 43500)] });
    const before = await onHand(RIZ_50KG);

    let d = (await detail(order.id)).body;
    expect(d).toMatchObject({
      status: 'confirmed',
      amountDue: order.total,
      customer: { name: expect.stringContaining('Afi') },
    });
    expect(d.address).toMatchObject({
      landmark: 'Portail bleu',
      zoneName: 'Zone 1 · Centre',
      location: { latitude: 6.14 },
    });
    expect(d.allowedActions).toEqual(
      expect.arrayContaining(['start_preparing', 'collect_payment', 'cancel', 'add_note']),
    );

    d = (await act(order.id, { action: 'start_preparing', expectedStatus: 'confirmed' })).body;
    expect(d.status).toBe('preparing');
    expect(d.allowedActions).toContain('dispatch');
    expect(d.allowedActions).not.toContain('mark_ready'); // retrait seulement

    d = (
      await act(order.id, {
        action: 'dispatch',
        expectedStatus: 'preparing',
        note: 'Livreur : Koffi, 90 11 22 33',
      })
    ).body;
    expect(d.status).toBe('out_for_delivery');

    // Clôturer sans encaisser : refusé.
    const early = await act(order.id, {
      action: 'mark_delivered',
      expectedStatus: 'out_for_delivery',
    });
    expect(early.status).toBe(422);
    expect(early.body.error.message).toMatch(/Encaissez/);

    expect(
      (await collect(order.id, { expectedStatus: 'out_for_delivery', amount: order.total - 100 }))
        .status,
    ).toBe(422);
    d = (await collect(order.id, { expectedStatus: 'out_for_delivery', amount: order.total })).body;
    expect(d).toMatchObject({ paymentStatus: 'succeeded', amountDue: 0 });
    expect(d.payments.at(-1)).toMatchObject({
      provider: 'manual',
      status: 'succeeded',
      amount: order.total,
    });

    d = (await act(order.id, { action: 'mark_delivered', expectedStatus: 'out_for_delivery' }))
      .body;
    expect(d.status).toBe('delivered');
    expect(d.allowedActions).toEqual(['add_note']);
    expect(d.history.map((h: { actor: string }) => h.actor)).toEqual([
      'Client',
      'Équipe orders',
      'Équipe orders',
      'Équipe orders',
    ]);

    // Côté client (app) : chaque étape, avec la note pour le livreur.
    const seen = await getOrder(t.db, customer.id, order.id);
    expect(seen.status).toBe('delivered');
    expect(seen.history.map((h) => h.status)).toEqual([
      'confirmed',
      'preparing',
      'out_for_delivery',
      'delivered',
    ]);
    expect(seen.history[2]?.note).toBe('Le livreur est en route — Livreur : Koffi, 90 11 22 33');
    expect(seen.payment.status).toBe('succeeded');

    // Stock : la marchandise est partie.
    const after = await onHand(RIZ_50KG);
    expect(after.onHand).toBe(before.onHand - 1);
    expect(after.reserved).toBe(before.reserved - 1);

    const audit = await t.db
      .select()
      .from(s.auditLog)
      .where(and(eq(s.auditLog.entity, 'order'), eq(s.auditLog.entityId, order.id)));
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'order.start_preparing',
        'order.dispatch',
        'order.payment_collected',
        'order.mark_delivered',
      ]),
    );
  });

  it('retrait en agence : code de retrait vérifié', async () => {
    const { order } = await customerOrder({ fulfillment: 'pickup' });
    await act(order.id, { action: 'start_preparing', expectedStatus: 'confirmed' });
    await act(order.id, { action: 'mark_ready', expectedStatus: 'preparing' });
    await collect(order.id, { expectedStatus: 'ready_for_pickup', amount: order.total });

    const wrong = await act(order.id, {
      action: 'complete_pickup',
      expectedStatus: 'ready_for_pickup',
      pickupCode: order.pickupCode === '000000' ? '111111' : '000000',
    });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.message).toMatch(/Code de retrait incorrect/);
    const missing = await act(order.id, {
      action: 'complete_pickup',
      expectedStatus: 'ready_for_pickup',
    });
    expect(missing.status).toBe(422);

    const ok = await act(order.id, {
      action: 'complete_pickup',
      expectedStatus: 'ready_for_pickup',
      pickupCode: order.pickupCode,
    });
    expect(ok.body.status).toBe('completed');
  });

  it('échec de livraison : retour en préparation avec motif obligatoire', async () => {
    const { order } = await customerOrder();
    await act(order.id, { action: 'start_preparing', expectedStatus: 'confirmed' });
    await act(order.id, { action: 'dispatch', expectedStatus: 'preparing' });
    expect(
      (await act(order.id, { action: 'delivery_failed', expectedStatus: 'out_for_delivery' }))
        .status,
    ).toBe(422);
    const res = await act(order.id, {
      action: 'delivery_failed',
      expectedStatus: 'out_for_delivery',
      note: 'client absent',
    });
    expect(res.body.status).toBe('preparing');
    expect(res.body.history.at(-1).note).toBe('Livraison reportée : client absent');
  });
});

describe('garde-fous', () => {
  it('étape impossible (sauter une étape, mauvais mode de réception) → 422', async () => {
    const { order } = await customerOrder();
    expect((await act(order.id, { action: 'dispatch', expectedStatus: 'confirmed' })).status).toBe(
      422,
    );
    await act(order.id, { action: 'start_preparing', expectedStatus: 'confirmed' });
    expect(
      (await act(order.id, { action: 'mark_ready', expectedStatus: 'preparing' })).status,
    ).toBe(422);
  });

  it('deux personnes sur la même commande : la seconde action est refusée (409)', async () => {
    const { order } = await customerOrder();
    const first = await act(order.id, { action: 'start_preparing', expectedStatus: 'confirmed' });
    const second = await act(
      order.id,
      { action: 'start_preparing', expectedStatus: 'confirmed' },
      'admin',
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: 'ORDER_CHANGED',
      details: { currentStatus: 'preparing' },
    });
  });

  it('rôles : service client et lecture seule consultent ; catalogue n’a pas accès', async () => {
    const { order } = await customerOrder();
    expect((await detail(order.id, 'readonly')).body.allowedActions).toEqual([]);
    expect((await detail(order.id, 'support')).body.allowedActions).toEqual(['add_note']);
    expect(
      (await act(order.id, { action: 'start_preparing', expectedStatus: 'confirmed' }, 'support'))
        .status,
    ).toBe(403);
    expect(
      (await act(order.id, { action: 'start_preparing', expectedStatus: 'confirmed' }, 'readonly'))
        .status,
    ).toBe(403);
    expect((await detail(order.id, 'catalog')).status).toBe(403);
    expect((await call(listRoute, 'GET', '/v1/admin/orders', as('catalog'))).status).toBe(403);
  });

  it('notes internes : visibles par l’équipe, jamais par le client', async () => {
    const { customer, order } = await customerOrder();
    const res = await call(notesRoute, 'POST', `/v1/admin/orders/${order.id}/notes`, {
      ...as('support'),
      params: { id: order.id },
      body: { text: 'Client prévenu par téléphone' },
    });
    expect(res.status).toBe(201);
    expect(res.body.notes).toEqual([
      expect.objectContaining({ text: 'Client prévenu par téléphone', author: 'Équipe support' }),
    ]);
    expect(JSON.stringify(await getOrder(t.db, customer.id, order.id))).not.toContain(
      'Client prévenu',
    );
  });
});

describe('annulation par l’équipe', () => {
  it('motif obligatoire ; stock libéré ; visible par le client', async () => {
    const { customer, order } = await customerOrder({ lines: [line(RIZ_50KG, 1, 43500)] });
    const before = await onHand(RIZ_50KG);
    expect((await cancel(order.id, { expectedStatus: 'confirmed', reason: '' })).status).toBe(400);
    const res = await cancel(order.id, {
      expectedStatus: 'confirmed',
      reason: 'Rupture chez le fournisseur',
    });
    expect(res.body).toMatchObject({ status: 'cancelled', allowedActions: ['add_note'] });
    expect((await onHand(RIZ_50KG)).reserved).toBe(before.reserved - 1);
    const seen = await getOrder(t.db, customer.id, order.id);
    expect(seen.history.at(-1)?.note).toBe('Annulée par AfriSime : Rupture chez le fournisseur');
  });

  it('commande payée en Mobile Money : remboursée', async () => {
    const { customer, order } = await customerOrder({ payment: 'mixx' });
    const p = await createPayment(
      t.db,
      customer.id,
      { orderId: order.id, method: 'mixx', phone: '+22890000009' },
      `cle-bo-pay-${seq}-x`,
    );
    await getPayment(t.db, customer.id, p.id, new Date(Date.now() + 6000));
    const res = await cancel(order.id, {
      expectedStatus: 'confirmed',
      reason: 'Adresse hors zone',
    });
    expect(res.body).toMatchObject({ status: 'refunded', paymentStatus: 'refunded' });
    expect(res.body.history.find((h: { status: string }) => h.status === 'refunded')?.note).toBe(
      'Remboursement Mixx by Yas sous 48 h',
    );
  });

  it('commande terminée : annulation refusée', async () => {
    const { order } = await customerOrder({ fulfillment: 'pickup' });
    await act(order.id, { action: 'start_preparing', expectedStatus: 'confirmed' });
    await act(order.id, { action: 'mark_ready', expectedStatus: 'preparing' });
    await collect(order.id, { expectedStatus: 'ready_for_pickup', amount: order.total });
    await act(order.id, {
      action: 'complete_pickup',
      expectedStatus: 'ready_for_pickup',
      pickupCode: order.pickupCode,
    });
    expect((await cancel(order.id, { expectedStatus: 'completed', reason: 'Erreur' })).status).toBe(
      409,
    );
  });
});

describe('liste', () => {
  it('onglets, compteurs, recherche par nom, numéro et téléphone, filtres', async () => {
    const { order: a } = await customerOrder({ name: 'Yawa' });
    const { order: b } = await customerOrder({ fulfillment: 'pickup', name: 'Komlan' });
    await act(b.id, { action: 'start_preparing', expectedStatus: 'confirmed' });

    const list = (url: string) => call(listRoute, 'GET', url, as('readonly')).then((r) => r.body);
    const toPrepare = await list('/v1/admin/orders?tab=to_prepare');
    expect(toPrepare.items.map((o: { id: string }) => o.id)).toContain(a.id);
    expect(toPrepare.items.map((o: { id: string }) => o.id)).not.toContain(b.id);
    expect(toPrepare.counts.preparing).toBeGreaterThanOrEqual(1);
    expect(toPrepare.counts.all).toBe(
      Object.entries(toPrepare.counts)
        .filter(([k]) => k !== 'all')
        .reduce((n, [, v]) => n + (v as number), 0),
    );

    expect(
      (await list('/v1/admin/orders?tab=all&q=yawa')).items.map((o: { id: string }) => o.id),
    ).toEqual([a.id]);
    expect((await list(`/v1/admin/orders?tab=all&q=${b.orderNumber}`)).items).toHaveLength(1);
    const phone = (await detail(a.id)).body.customer.phone.slice(-6);
    expect(
      (await list(`/v1/admin/orders?tab=all&q=${phone}`)).items.map((o: { id: string }) => o.id),
    ).toContain(a.id);
    const pickups = await list('/v1/admin/orders?tab=all&fulfillment=pickup');
    expect(pickups.items.every((o: { fulfillment: string }) => o.fulfillment === 'pickup')).toBe(
      true,
    );
    const today = new Date().toISOString().slice(0, 10);
    expect(
      (await list(`/v1/admin/orders?tab=all&from=${today}&to=${today}`)).items.length,
    ).toBeGreaterThan(0);
    expect((await list('/v1/admin/orders?tab=all&from=2020-01-01&to=2020-01-02')).items).toEqual(
      [],
    );
  });

  it('commande non payée à temps : annulée à l’affichage de la liste', async () => {
    const { order } = await customerOrder({ payment: 'mixx' });
    await t.db
      .update(s.orders)
      .set({ paymentDeadline: new Date(Date.now() - 1000) })
      .where(eq(s.orders.id, order.id));
    const res = await call(listRoute, 'GET', '/v1/admin/orders?tab=cancelled', as('orders'));
    expect(res.body.items.map((o: { id: string }) => o.id)).toContain(order.id);
  });
});
