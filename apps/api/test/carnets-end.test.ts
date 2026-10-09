import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as abandonRoute } from '@/app/v1/me/carnets/[id]/abandon/route';
import { POST as redeemRoute } from '@/app/v1/me/carnets/[id]/redeem/route';
import { GET as storeCreditRoute } from '@/app/v1/me/store-credit/route';
import { createSession } from '@/server/auth/sessions';
import {
  abandonCarnet,
  getCarnet,
  listCarnets,
  redeemCarnet,
  subscribe,
} from '@/server/carnets/service';
import { invalidateCatalog } from '@/server/catalog/service';
import { createQuote, getDeliveryOptions } from '@/server/checkout/service';
import { createAddress } from '@/server/customers/addresses';
import { storeCreditBalance } from '@/server/customers/storeCredit';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { cancelOrder, createOrder } from '@/server/orders/service';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;
const DAY = 86_400_000;
const key = () => `cle-fin-${++seq}-xxxxxxxx`;

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

async function customer() {
  const id = `usr_fin_${++seq}`;
  await t.db
    .insert(s.customers)
    .values({
      id,
      phone: `+2289${String(8500000 + seq).slice(-7)}`,
      firstName: 'Ama',
      lastName: `Fin${seq}`,
    });
  const session = await createSession(t.db, id, null);
  const address = await createAddress(t.db, id, {
    label: 'Maison',
    recipientName: 'Ama',
    phone: '+22890112233',
    district: 'Tokoin',
    city: 'Lomé',
    landmark: 'Près du marché',
    instructions: null,
    location: null,
    isDefault: true,
  });
  return { id, segment: 'retail', token: session.accessToken, address };
}

/** Carnet avec un montant déjà versé (cotisation réussie enregistrée directement). */
async function carnetWith(c: { id: string }, paid: number, startedAt = new Date()) {
  const carnet = await subscribe(t.db, c, 'pack_quinzaine', key(), startedAt);
  if (paid > 0) {
    await t.db.insert(s.carnetContributions).values({
      id: `cot_fin_${++seq}`,
      carnetId: carnet.id,
      method: 'cash',
      amount: paid,
      status: 'succeeded',
      agencyId: 'agc_lome_centre',
      settledAt: startedAt,
      createdAt: startedAt,
    });
    await t.db
      .update(s.carnets)
      .set({ paid, ...(paid >= 19_500 ? { status: 'completed', completedAt: startedAt } : {}) })
      .where(eq(s.carnets.id, carnet.id));
  }
  return carnet;
}

const line = {
  variantId: 'var_riz-parfume-savana_0',
  quantity: 2,
  expectedUnitPrice: 4750,
  expectedAvailability: 'available' as const,
};

describe('abandon et délai dépassé', () => {
  it('abandon : versements transformés en avoir, une seule fois', async () => {
    const c = await customer();
    const carnet = await carnetWith(c, 2600);
    const res = await call(abandonRoute, 'POST', `/v1/me/carnets/${carnet.id}/abandon`, {
      token: c.token,
      params: { id: carnet.id },
    });
    expect(res.body).toMatchObject({ status: 'abandoned', creditedAmount: 2600 });
    expect(
      (
        await call(abandonRoute, 'POST', `/v1/me/carnets/${carnet.id}/abandon`, {
          token: c.token,
          params: { id: carnet.id },
        })
      ).status,
    ).toBe(422);
    const credit = await call(storeCreditRoute, 'GET', '/v1/me/store-credit', { token: c.token });
    expect(credit.body).toMatchObject({
      balance: 2600,
      entries: [expect.objectContaining({ amount: 2600, reason: 'carnet_abandoned' })],
    });
  });

  it('délai maximum dépassé (2 × la durée) : carnet clos automatiquement, avoir crédité', async () => {
    const c = await customer();
    const carnet = await carnetWith(c, 1300, new Date(Date.now() - 31 * DAY));
    expect(carnet.deadlineAt).toBe(new Date(Date.parse(carnet.startedAt) + 30 * DAY).toISOString());
    const after = await getCarnet(t.db, c, carnet.id);
    expect(after).toMatchObject({ status: 'abandoned', creditedAmount: 1300 });
    expect(await storeCreditBalance(t.db, c.id)).toBe(1300);
  });
});

describe('liste des carnets', () => {
  it('abandonné sans versement : retiré de « Mes carnets » ; avec versements : gardé', async () => {
    const c = await customer();
    const empty = await carnetWith(c, 0);
    const paid = await carnetWith(c, 1300);
    await abandonCarnet(t.db, c, empty.id);
    await abandonCarnet(t.db, c, paid.id);
    const ids = (await listCarnets(t.db, c)).items.map((x) => x.id);
    expect(ids).toEqual([paid.id]);
  });
});

describe('avoir à la commande', () => {
  it('déduit du total, débité à la commande, rendu si la commande est annulée', async () => {
    const c = await customer();
    await abandonCarnet(t.db, c, (await carnetWith(c, 2600)).id);
    const opts = await getDeliveryOptions(t.db, c, c.address.id);
    const slotId = opts.delivery!.slots.find((x) => x.available)!.id;
    const request = {
      fulfillment: 'delivery' as const,
      addressId: c.address.id,
      agencyId: null,
      slotId,
      paymentMethod: 'mixx' as const,
      useCredit: false,
      lines: [line],
    };

    const without = await createQuote(t.db, c, request);
    expect(without).toMatchObject({ storeCreditApplied: 0, total: 9500 + 500 });
    const quote = await createQuote(t.db, c, { ...request, useStoreCredit: true });
    expect(quote).toMatchObject({ storeCreditApplied: 2600, total: 10_000 - 2600 });

    const order = await createOrder(t.db, c, quote.quoteId, key());
    expect(order).toMatchObject({ storeCreditUsed: 2600, total: 7400, status: 'pending_payment' });
    expect(await storeCreditBalance(t.db, c.id)).toBe(0);

    await cancelOrder(t.db, c.id, order.id, null);
    expect(await storeCreditBalance(t.db, c.id)).toBe(2600);
  });

  it('avoir suffisant : commande réglée d’office, rien à payer', async () => {
    const c = await customer();
    await abandonCarnet(t.db, c, (await carnetWith(c, 15_000)).id);
    const opts = await getDeliveryOptions(t.db, c, c.address.id);
    const quote = await createQuote(t.db, c, {
      fulfillment: 'delivery',
      addressId: c.address.id,
      agencyId: null,
      slotId: opts.delivery!.slots.find((x) => x.available)!.id,
      paymentMethod: 'mixx',
      useCredit: false,
      useStoreCredit: true,
      lines: [line],
    });
    const order = await createOrder(t.db, c, quote.quoteId, key());
    expect(order).toMatchObject({
      total: 0,
      storeCreditUsed: 10_000,
      status: 'confirmed',
      payment: { status: 'succeeded' },
    });
    expect(await storeCreditBalance(t.db, c.id)).toBe(5000);
  });
});

describe('remise du pack soldé', () => {
  it('retrait en agence : commande déjà payée, une seule par carnet ; annulée, le pack redevient à remettre', async () => {
    const c = await customer();
    const carnet = await carnetWith(c, 19_500);
    const opts = await getDeliveryOptions(t.db, c, null);
    const agency = opts.pickup.agencies[0]!;
    const body = {
      fulfillment: 'pickup' as const,
      addressId: null,
      agencyId: agency.agencyId,
      slotId: agency.slots.find((x) => x.available)!.id,
    };
    const k = key();
    const redeem = () =>
      call(redeemRoute, 'POST', `/v1/me/carnets/${carnet.id}/redeem`, {
        token: c.token,
        params: { id: carnet.id },
        body,
        headers: { 'idempotency-key': k },
      });

    const res = await redeem();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'confirmed',
      total: 0,
      subtotal: 19_500,
      discountTotal: 19_500,
      payment: { status: 'succeeded' },
    });
    expect(res.body.lines).toHaveLength(6);
    expect(res.body.lines.reduce((n: number, l: { lineTotal: number }) => n + l.lineTotal, 0)).toBe(
      19_500,
    );
    expect(res.body.history[0].note).toMatch(/réglé par votre carnet/);
    expect((await redeem()).body.id).toBe(res.body.id); // rejouée : même commande
    await expect(redeemCarnet(t.db, c, carnet.id, body, key())).rejects.toMatchObject({
      status: 422,
    });
    expect(await getCarnet(t.db, c, carnet.id)).toMatchObject({
      status: 'delivered',
      orderId: res.body.id,
    });

    await cancelOrder(t.db, c.id, res.body.id, null);
    expect(await getCarnet(t.db, c, carnet.id)).toMatchObject({
      status: 'completed',
      orderId: null,
    });
  });

  it('livraison : seuls les frais de zone restent à payer, au livreur', async () => {
    const c = await customer();
    const carnet = await carnetWith(c, 19_500);
    const opts = await getDeliveryOptions(t.db, c, c.address.id);
    const order = await redeemCarnet(
      t.db,
      c,
      carnet.id,
      {
        fulfillment: 'delivery',
        addressId: c.address.id,
        agencyId: null,
        slotId: opts.delivery!.slots.find((x) => x.available)!.id,
      },
      key(),
    );
    expect(order).toMatchObject({
      total: 500,
      deliveryFee: 500,
      payment: { method: 'cash_on_delivery', status: 'pending' },
    });
  });

  it('carnet pas encore soldé : refusé', async () => {
    const c = await customer();
    const carnet = await carnetWith(c, 1300);
    const opts = await getDeliveryOptions(t.db, c, null);
    const agency = opts.pickup.agencies[0]!;
    await expect(
      redeemCarnet(
        t.db,
        c,
        carnet.id,
        {
          fulfillment: 'pickup',
          addressId: null,
          agencyId: agency.agencyId,
          slotId: agency.slots[0]!.id,
        },
        key(),
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
});
