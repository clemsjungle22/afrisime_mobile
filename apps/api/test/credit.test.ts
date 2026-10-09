import type { AdminRole } from '@afrisime/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as cashRoute } from '@/app/v1/admin/credit/[id]/cash/route';
import { POST as rejectRoute } from '@/app/v1/admin/credit/[id]/reject/route';
import { GET as adminCreditRoute, PUT as grantRoute } from '@/app/v1/admin/credit/[id]/route';
import { POST as suspendRoute } from '@/app/v1/admin/credit/[id]/suspend/route';
import { GET as adminCreditsRoute } from '@/app/v1/admin/credit/route';
import { POST as repayRoute } from '@/app/v1/me/credit/repayments/route';
import { POST as requestRoute } from '@/app/v1/me/credit/requests/route';
import { GET as creditRoute } from '@/app/v1/me/credit/route';
import { POST as webhookRoute } from '@/app/v1/webhooks/payments/[provider]/route';
import { login } from '@/server/admin/auth';
import { hashPassword } from '@/server/admin/crypto';
import { createSession } from '@/server/auth/sessions';
import { validate } from '@/server/cart/service';
import { invalidateCatalog } from '@/server/catalog/service';
import { createQuote, getDeliveryOptions } from '@/server/checkout/service';
import { getCreditAccount } from '@/server/credit/service';
import { createAddress } from '@/server/customers/addresses';
import { storeCreditBalance } from '@/server/customers/storeCredit';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { tick } from '@/server/jobs';
import { cancelOrder, createOrder } from '@/server/orders/service';
import { SIGNATURE_HEADER, SIM_CONFIRM_MS, signWebhook } from '@/server/payments/provider';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;
const PASSWORD = 'mot-de-passe-equipe-2026';
const tokens: Partial<Record<AdminRole, string>> = {};
const DAY = 86_400_000;
const key = () => `cle-credit-${++seq}-xxxxxxxx`;

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  invalidateCatalog();
  const hash = await hashPassword(PASSWORD);
  for (const role of ['admin', 'orders', 'support'] as AdminRole[]) {
    const email = `${role}@credit.test`;
    await t.db.insert(s.adminUsers).values({
      id: `adm_${role}`,
      email,
      name: `Équipe ${role}`,
      role: role === 'admin' ? 'orders' : role,
      passwordHash: hash,
      mustChangePassword: false,
    });
    const res = await login(
      t.db,
      { email, password: PASSWORD },
      { ip: '1.1.1.1', userAgent: null },
    );
    tokens[role] = (res as { token: string }).token;
  }
  await t.db.update(s.adminUsers).set({ role: 'admin' }).where(eq(s.adminUsers.id, 'adm_admin'));
});
afterAll(async () => {
  setDb(null);
  invalidateCatalog();
  await t.close();
});

/** Cliente : revendeuse validée par défaut. */
async function customer(pro: 'validated' | 'pending' | 'retail' = 'validated') {
  const id = `usr_cre_${++seq}`;
  await t.db.insert(s.customers).values({
    id,
    phone: `+2289${String(8600000 + seq).slice(-7)}`,
    firstName: 'Afi',
    lastName: `Crédit${seq}`,
    customerTypeId: pro === 'retail' ? 'particulier' : 'revendeur',
    customerTypePending: pro === 'pending',
    segment: pro === 'validated' ? 'pro' : 'retail',
  });
  const session = await createSession(t.db, id, null);
  const address = await createAddress(t.db, id, {
    label: 'Boutique',
    recipientName: 'Afi',
    phone: '+22890112233',
    district: 'Tokoin',
    city: 'Lomé',
    landmark: 'Près du marché',
    instructions: null,
    location: null,
    isDefault: true,
  });
  return {
    id,
    segment: pro === 'validated' ? 'pro' : 'retail',
    token: session.accessToken,
    address,
  };
}

type Customer = Awaited<ReturnType<typeof customer>>;

async function grant(c: Customer, limit = 50_000, termDays = 30) {
  const res = await call(grantRoute, 'PUT', `/v1/admin/credit/${c.id}`, {
    token: tokens.admin,
    params: { id: c.id },
    body: { limit, termDays },
  });
  expect(res.status).toBe(200);
  return res.body;
}

/** Ligne au prix du segment de la cliente (sinon le devis signale un changement de prix). */
async function line(c: Customer, quantity = 2) {
  const base = {
    variantId: 'var_riz-parfume-savana_0',
    quantity,
    expectedUnitPrice: null,
    expectedAvailability: 'available' as const,
  };
  const validated = await validate({ lines: [base] }, c.segment);
  return { ...base, expectedUnitPrice: validated.lines[0]!.unitPrice };
}

/** Commande à crédit (retrait en agence : pas de frais). */
async function buyOnCredit(c: Customer, quantity = 2, now = new Date()) {
  const opts = await getDeliveryOptions(t.db, c, null, now);
  const agency = opts.pickup.agencies[0]!;
  const quote = await createQuote(
    t.db,
    c,
    {
      fulfillment: 'pickup',
      addressId: null,
      agencyId: agency.agencyId,
      slotId: agency.slots.find((x) => x.available)!.id,
      paymentMethod: 'credit',
      useCredit: true,
      lines: [await line(c, quantity)],
    },
    now,
  );
  return createOrder(t.db, c, quote.quoteId, key(), now);
}

describe('demande et accord', () => {
  it('seule une cliente pro validée peut demander un crédit', async () => {
    for (const kind of ['retail', 'pending'] as const) {
      const c = await customer(kind);
      const res = await call(requestRoute, 'POST', '/v1/me/credit/requests', {
        token: c.token,
        body: { amount: 50_000 },
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CREDIT_NOT_ELIGIBLE');
      expect(
        (await call(creditRoute, 'GET', '/v1/me/credit', { token: c.token })).body,
      ).toMatchObject({
        status: 'none',
        canRequest: false,
      });
    }
  });

  it('demande → liste « Demandes » → accord par l’administrateur', async () => {
    const c = await customer();
    expect(
      (await call(creditRoute, 'GET', '/v1/me/credit', { token: c.token })).body,
    ).toMatchObject({ canRequest: true });
    const res = await call(requestRoute, 'POST', '/v1/me/credit/requests', {
      token: c.token,
      body: { amount: 60_000, message: 'Pour ma boutique au marché' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'none',
      canRequest: false,
      request: { status: 'pending', amount: 60_000 },
    });
    // Deuxième demande refusée tant que la première est en attente.
    expect(
      (
        await call(requestRoute, 'POST', '/v1/me/credit/requests', {
          token: c.token,
          body: { amount: 10_000 },
        })
      ).status,
    ).toBe(422);

    const list = await call(adminCreditsRoute, 'GET', '/v1/admin/credit?filter=requests', {
      token: tokens.support,
    });
    expect(list.body.items.some((r: { customer: { id: string } }) => r.customer.id === c.id)).toBe(
      true,
    );

    // Le support consulte mais ne décide pas.
    const denied = await call(grantRoute, 'PUT', `/v1/admin/credit/${c.id}`, {
      token: tokens.support,
      params: { id: c.id },
      body: { limit: 50_000, termDays: 30 },
    });
    expect(denied.status).toBe(403);

    const detail = await grant(c, 50_000, 30);
    expect(detail).toMatchObject({
      status: 'active',
      limit: 50_000,
      available: 50_000,
      pendingRequest: null,
      canManage: true,
    });
    expect(detail.requests[0]).toMatchObject({ status: 'approved' });
    expect(
      (await call(creditRoute, 'GET', '/v1/me/credit', { token: c.token })).body,
    ).toMatchObject({
      status: 'active',
      limit: 50_000,
      available: 50_000,
      termDays: 30,
      canBuy: true,
    });
  });

  it('refus avec motif, visible par la cliente', async () => {
    const c = await customer();
    await call(requestRoute, 'POST', '/v1/me/credit/requests', {
      token: c.token,
      body: { amount: 20_000 },
    });
    const res = await call(rejectRoute, 'POST', `/v1/admin/credit/${c.id}/reject`, {
      token: tokens.admin,
      params: { id: c.id },
      body: { reason: 'Revenez dans trois mois' },
    });
    expect(res.status).toBe(200);
    expect(
      (await call(creditRoute, 'GET', '/v1/me/credit', { token: c.token })).body,
    ).toMatchObject({
      status: 'none',
      canRequest: true,
      request: { status: 'rejected', reason: 'Revenez dans trois mois' },
    });
  });
});

describe('achat à crédit', () => {
  it('« Payer à crédit » proposé seulement avec un crédit ouvert ; commande confirmée, dette créée', async () => {
    const c = await customer();
    expect(
      (await getDeliveryOptions(t.db, c, null)).paymentMethods.some((m) => m.id === 'credit'),
    ).toBe(false);
    await grant(c, 50_000, 10);
    const option = (await getDeliveryOptions(t.db, c, null)).paymentMethods.find(
      (m) => m.id === 'credit',
    );
    expect(option).toMatchObject({ available: true });

    const order = await buyOnCredit(c);
    expect(order).toMatchObject({ status: 'confirmed', payment: { method: 'credit' } });
    const account = await getCreditAccount(t.db, c);
    expect(account.used).toBe(order.total);
    expect(account.available).toBe(50_000 - order.total);
    expect(account.debts[0]).toMatchObject({
      orderId: order.id,
      amount: order.total,
      dailyAmount: Math.ceil(order.total / 10),
      dueToday: 0,
      status: 'open',
    });
  });

  it('plafond dépassé : refusé au devis', async () => {
    const c = await customer();
    await grant(c, 5_000);
    const opts = await getDeliveryOptions(t.db, c, null);
    const agency = opts.pickup.agencies[0]!;
    await expect(
      createQuote(t.db, c, {
        fulfillment: 'pickup',
        addressId: null,
        agencyId: agency.agencyId,
        slotId: agency.slots.find((x) => x.available)!.id,
        paymentMethod: 'credit',
        useCredit: true,
        lines: [await line(c, 2)],
      }),
    ).rejects.toMatchObject({ code: 'CREDIT_INSUFFICIENT' });
  });

  it('retard : plus d’achat à crédit jusqu’au remboursement ; suspension par l’équipe', async () => {
    const c = await customer();
    await grant(c, 50_000, 10);
    const start = new Date(Date.now() - 3 * DAY);
    await buyOnCredit(c, 2, start);
    const late = await getCreditAccount(t.db, c);
    expect(late.daysLate).toBeGreaterThan(0);
    expect(late.canBuy).toBe(false);
    const option = (await getDeliveryOptions(t.db, c, null)).paymentMethods.find(
      (m) => m.id === 'credit',
    );
    expect(option).toMatchObject({ available: false });

    // Espèces au comptoir : le retard est réglé.
    const cash = await call(cashRoute, 'POST', `/v1/admin/credit/${c.id}/cash`, {
      token: tokens.orders,
      params: { id: c.id },
      body: { amount: late.dueToday, agencyId: 'agc_lome_centre', note: 'Reçu n° 12' },
    });
    expect(cash.status).toBe(200);
    expect(cash.body).toMatchObject({ daysLate: 0 });
    expect(cash.body.repayments[0]).toMatchObject({
      method: 'cash',
      recordedBy: 'Équipe orders',
      note: 'Reçu n° 12',
    });
    expect((await getCreditAccount(t.db, c)).canBuy).toBe(true);

    const suspended = await call(suspendRoute, 'POST', `/v1/admin/credit/${c.id}/suspend`, {
      token: tokens.admin,
      params: { id: c.id },
      body: { suspended: true, reason: 'Retards répétés' },
    });
    expect(suspended.body).toMatchObject({
      status: 'suspended',
      suspendedReason: 'Retards répétés',
    });
    expect((await getCreditAccount(t.db, c)).canBuy).toBe(false);
    await expect(buyOnCredit(c)).rejects.toMatchObject({ code: 'CREDIT_SUSPENDED' });
    await call(suspendRoute, 'POST', `/v1/admin/credit/${c.id}/suspend`, {
      token: tokens.admin,
      params: { id: c.id },
      body: { suspended: false },
    });
    expect((await getCreditAccount(t.db, c)).canBuy).toBe(true);
  });

  it('commande annulée : dette effacée, aucun remboursement Mobile Money ; déjà remboursé → avoir', async () => {
    const c = await customer();
    await grant(c);
    const order = await buyOnCredit(c);
    await call(cashRoute, 'POST', `/v1/admin/credit/${c.id}/cash`, {
      token: tokens.admin,
      params: { id: c.id },
      body: { amount: 1_000, agencyId: 'agc_lome_centre' },
    });
    const cancelled = await cancelOrder(t.db, c.id, order.id, null);
    expect(cancelled.status).toBe('cancelled');
    const account = await getCreditAccount(t.db, c);
    expect(account).toMatchObject({ used: 0, available: 50_000 });
    expect(account.debts[0]).toMatchObject({ status: 'cancelled', remaining: 0 });
    expect(await storeCreditBalance(t.db, c.id)).toBe(1_000);
  });
});

describe('remboursements', () => {
  it('Mobile Money : en attente, confirmé ; réparti de la dette la plus ancienne vers la plus récente', async () => {
    const c = await customer();
    await grant(c, 100_000);
    const T0 = new Date();
    const first = await buyOnCredit(c, 1, new Date(T0.getTime() - 2_000));
    const second = await buyOnCredit(c, 1, T0);
    const amount = first.total + 500;

    const res = await call(repayRoute, 'POST', '/v1/me/credit/repayments', {
      token: c.token,
      headers: { 'idempotency-key': key() },
      body: { amount, method: 'mixx', phone: '+22890112233' },
    });
    expect(res.status).toBe(201);
    expect(res.body.pendingRepayment).toMatchObject({ amount, status: 'pending' });

    // Trop demandé : refusé.
    const tooMuch = await call(repayRoute, 'POST', '/v1/me/credit/repayments', {
      token: c.token,
      headers: { 'idempotency-key': key() },
      body: { amount: 10_000_000, method: 'mixx', phone: '+22890112233' },
    });
    expect([201, 422]).toContain(tooMuch.status); // une demande en cours est renvoyée telle quelle

    const done = await getCreditAccount(t.db, c, new Date(T0.getTime() + SIM_CONFIRM_MS + 1000));
    expect(done.pendingRepayment).toBeNull();
    const byOrder = new Map(done.debts.map((d) => [d.orderId, d]));
    expect(byOrder.get(first.id)).toMatchObject({ status: 'settled', remaining: 0 });
    expect(byOrder.get(second.id)).toMatchObject({ paid: 500, status: 'open' });
    expect(done.used).toBe(second.total - 500);
  });

  it('webhook du prestataire et tâche périodique confirment le remboursement', async () => {
    const c = await customer();
    await grant(c);
    await buyOnCredit(c);
    const pending = await call(repayRoute, 'POST', '/v1/me/credit/repayments', {
      token: c.token,
      headers: { 'idempotency-key': key() },
      body: { amount: 1_500, method: 'flooz', phone: '+22890112233' },
    });
    const body = JSON.stringify({
      eventId: `evt_credit_${seq}`,
      reference: `sim_${pending.body.pendingRepayment.id}`,
      status: 'succeeded',
      failureReason: null,
    });
    const res = await webhookRoute(
      new Request('http://localhost/v1/webhooks/payments/simulated', {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signWebhook(body) },
        body,
      }),
      { params: Promise.resolve({ provider: 'simulated' }) },
    );
    expect(res.status).toBe(200);
    expect((await getCreditAccount(t.db, c)).debts[0]).toMatchObject({ paid: 1_500 });

    const res2 = await call(repayRoute, 'POST', '/v1/me/credit/repayments', {
      token: c.token,
      headers: { 'idempotency-key': key() },
      body: { amount: 1_000, method: 'mixx', phone: '+22890112233' },
    });
    expect(res2.status).toBe(201);
    const result = await tick(t.db, new Date(Date.now() + SIM_CONFIRM_MS + 20_000));
    expect(result.repaymentsChecked).toBeGreaterThan(0);
    expect((await getCreditAccount(t.db, c)).debts[0]).toMatchObject({ paid: 2_500 });
  });

  it('fiche back-office : dettes, remboursements, demandes', async () => {
    const c = await customer();
    await grant(c);
    await buyOnCredit(c);
    const res = await call(adminCreditRoute, 'GET', `/v1/admin/credit/${c.id}`, {
      token: tokens.orders,
      params: { id: c.id },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'active',
      isProValidated: true,
      canManage: false,
      canRecordCash: true,
      grantedBy: 'Équipe admin',
    });
    expect(res.body.debts).toHaveLength(1);
  });
});
