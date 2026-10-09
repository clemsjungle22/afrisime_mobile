import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as readRoute } from '@/app/v1/me/notifications/read/route';
import { GET as notificationsRoute } from '@/app/v1/me/notifications/route';
import { createSession } from '@/server/auth/sessions';
import { contribute, subscribe } from '@/server/carnets/service';
import { validate } from '@/server/cart/service';
import { invalidateCatalog } from '@/server/catalog/service';
import { createQuote, getDeliveryOptions } from '@/server/checkout/service';
import { getCarnet } from '@/server/carnets/service';
import type { Db } from '@/server/db/client';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { listNotifications } from '@/server/notifications/service';
import { cancelOrder, createOrder } from '@/server/orders/service';
import { transition } from '@/server/orders/state';
import { SIM_CONFIRM_MS } from '@/server/payments/provider';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;
const key = () => `cle-notif-${++seq}-xxxxxxxx`;

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
  const id = `usr_ntf_${++seq}`;
  await t.db
    .insert(s.customers)
    .values({ id, phone: `+2289${String(8700000 + seq).slice(-7)}`, firstName: 'Kossi' });
  const session = await createSession(t.db, id, null);
  return { id, segment: 'retail', token: session.accessToken };
}

async function order(c: Awaited<ReturnType<typeof customer>>) {
  const opts = await getDeliveryOptions(t.db, c, null);
  const agency = opts.pickup.agencies[0]!;
  const base = {
    variantId: 'var_riz-parfume-savana_0',
    quantity: 1,
    expectedUnitPrice: null,
    expectedAvailability: 'available' as const,
  };
  const price = (await validate({ lines: [base] }, c.segment)).lines[0]!.unitPrice;
  const quote = await createQuote(t.db, c, {
    fulfillment: 'pickup',
    addressId: null,
    agencyId: agency.agencyId,
    slotId: agency.slots.find((x) => x.available)!.id,
    paymentMethod: 'pay_at_agency',
    useCredit: false,
    lines: [{ ...base, expectedUnitPrice: price }],
  });
  return createOrder(t.db, c, quote.quoteId, key());
}

describe('notifications', () => {
  it('étapes de commande : une notification par étape, lien vers la commande ; rien pour sa propre annulation', async () => {
    const c = await customer();
    const o = await order(c);
    await t.db.transaction(async (tx) => {
      await transition(
        tx as unknown as Db,
        o.id,
        ['confirmed'],
        'preparing',
        null,
        new Date(),
        {},
        'admin:adm_x',
      );
      await transition(
        tx as unknown as Db,
        o.id,
        ['preparing'],
        'ready_for_pickup',
        null,
        new Date(),
        {},
        'admin:adm_x',
      );
    });
    const res = await call(notificationsRoute, 'GET', '/v1/me/notifications', { token: c.token });
    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(2);
    expect(res.body.items[0]).toMatchObject({
      kind: 'order',
      title: 'Commande prête',
      read: false,
      link: { type: 'order', orderId: o.id },
    });
    expect(res.body.items[1]).toMatchObject({ title: 'Commande en préparation' });

    const other = await order(c);
    await cancelOrder(t.db, c.id, other.id, null);
    expect((await listNotifications(t.db, c.id)).items).toHaveLength(2);
  });

  it('marquer lues : une seule ou toutes ; chacun ne voit que les siennes', async () => {
    const c = await customer();
    const o = await order(c);
    await t.db.transaction((tx) =>
      transition(
        tx as unknown as Db,
        o.id,
        ['confirmed'],
        'preparing',
        null,
        new Date(),
        {},
        'system',
      ),
    );
    await t.db.transaction((tx) =>
      transition(
        tx as unknown as Db,
        o.id,
        ['preparing'],
        'ready_for_pickup',
        null,
        new Date(),
        {},
        'system',
      ),
    );
    const list = await listNotifications(t.db, c.id);
    const one = await call(readRoute, 'POST', '/v1/me/notifications/read', {
      token: c.token,
      body: { ids: [list.items[0]!.id] },
    });
    expect(one.body.unread).toBe(1);
    const all = await call(readRoute, 'POST', '/v1/me/notifications/read', {
      token: c.token,
      body: {},
    });
    expect(all.body).toMatchObject({ unread: 0 });
    expect(all.body.items.every((n: { read: boolean }) => n.read)).toBe(true);

    const stranger = await customer();
    expect((await listNotifications(t.db, stranger.id)).items).toHaveLength(0);
  });

  it('carnet : cotisation reçue, puis carnet soldé', async () => {
    const c = await customer();
    const carnet = await subscribe(t.db, c, 'pack_quinzaine', key());
    const T0 = new Date();
    await contribute(
      t.db,
      c,
      carnet.id,
      { amount: 1300, method: 'mixx', phone: '+22890112233' },
      key(),
      T0,
    );
    await getCarnet(t.db, c, carnet.id, new Date(T0.getTime() + SIM_CONFIRM_MS + 1000));
    const first = (await listNotifications(t.db, c.id)).items[0];
    expect(first).toMatchObject({
      kind: 'carnet',
      title: 'Cotisation reçue',
      link: { type: 'carnet', carnetId: carnet.id },
    });
    expect(first?.body).toMatch(/^1\s300/);

    const T1 = new Date(T0.getTime() + 60_000);
    await contribute(
      t.db,
      c,
      carnet.id,
      { amount: 18_200, method: 'mixx', phone: '+22890112233' },
      key(),
      T1,
    );
    await getCarnet(t.db, c, carnet.id, new Date(T1.getTime() + SIM_CONFIRM_MS + 1000));
    expect((await listNotifications(t.db, c.id)).items[0]).toMatchObject({
      title: 'Carnet soldé !',
    });
  });
});
