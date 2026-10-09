import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELETE as unfavRoute, PUT as favRoute } from '@/app/v1/me/favorites/[productId]/route';
import { GET as favoritesRoute } from '@/app/v1/me/favorites/route';
import {
  DELETE as removeItemRoute,
  PATCH as setItemRoute,
} from '@/app/v1/me/lists/[id]/items/[variantId]/route';
import { POST as addItemRoute } from '@/app/v1/me/lists/[id]/items/route';
import {
  DELETE as deleteListRoute,
  GET as listRoute,
  PATCH as renameRoute,
} from '@/app/v1/me/lists/[id]/route';
import { GET as listsRoute, POST as createListRoute } from '@/app/v1/me/lists/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateCatalog } from '@/server/catalog/service';
import { createQuote, getDeliveryOptions } from '@/server/checkout/service';
import { createAddress } from '@/server/customers/addresses';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { createOrder } from '@/server/orders/service';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;
const RIZ = 'prd_0001';
const RIZ_5KG = 'var_riz-parfume-savana_0'; // 4 750 F
const RIZ_50KG = 'var_riz-parfume-savana_2'; // stock limité à 5
const CUBES = 'var_cubes-assaisonnement_0'; // indisponible

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
  const id = `usr_lst_${++seq}`;
  await t.db
    .insert(s.customers)
    .values({ id, phone: `+2289${String(8300000 + seq).slice(-7)}`, firstName: 'Akpéné' });
  const session = await createSession(t.db, id, null);
  return { id, token: session.accessToken };
}

describe('favoris', () => {
  it('ajouter (rejouable), lister au prix du moment, retirer ; réservé au client connecté', async () => {
    const c = await customer();
    expect((await call(favoritesRoute, 'GET', '/v1/me/favorites')).status).toBe(401);

    const add = () =>
      call(favRoute, 'PUT', `/v1/me/favorites/${RIZ}`, {
        token: c.token,
        params: { productId: RIZ },
      });
    expect((await add()).body.items.map((p: { id: string }) => p.id)).toEqual([RIZ]);
    expect((await add()).body.items).toHaveLength(1); // rejoué : pas de doublon

    const list = await call(favoritesRoute, 'GET', '/v1/me/favorites', { token: c.token });
    expect(list.body.items[0]).toMatchObject({
      slug: 'riz-parfume-savana',
      defaultVariant: { price: 4750 },
    });

    const unknown = await call(favRoute, 'PUT', '/v1/me/favorites/prd_inconnu', {
      token: c.token,
      params: { productId: 'prd_inconnu' },
    });
    expect(unknown.status).toBe(404);

    const removed = await call(unfavRoute, 'DELETE', `/v1/me/favorites/${RIZ}`, {
      token: c.token,
      params: { productId: RIZ },
    });
    expect(removed.body.items).toEqual([]);
  });
});

describe('listes d’achats', () => {
  it('créer, ajouter (quantités cumulées), modifier, retirer, renommer, supprimer', async () => {
    const c = await customer();
    const created = await call(createListRoute, 'POST', '/v1/me/lists', {
      token: c.token,
      body: {
        name: 'Courses du mois',
        lines: [
          { variantId: RIZ_5KG, quantity: 2 },
          { variantId: 'var_inconnu', quantity: 1 },
        ],
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body.lines.map((l: { variantId: string }) => l.variantId)).toEqual([RIZ_5KG]); // format inconnu ignoré

    const opts = (body: object, variantId?: string) => ({
      token: c.token,
      params: (variantId ? { id, variantId } : { id }) as Record<string, string>,
      body,
    });
    let list = (
      await call(
        addItemRoute,
        'POST',
        `/v1/me/lists/${id}/items`,
        opts({ variantId: RIZ_5KG, quantity: 3 }),
      )
    ).body;
    expect(list.lines[0]).toMatchObject({
      variantId: RIZ_5KG,
      requestedQuantity: 5,
      unitPrice: 4750,
    });

    list = (
      await call(
        addItemRoute,
        'POST',
        `/v1/me/lists/${id}/items`,
        opts({ variantId: CUBES, quantity: 1 }),
      )
    ).body;
    expect(list.lines.find((l: { variantId: string }) => l.variantId === CUBES)).toMatchObject({
      status: 'unavailable',
      quantity: 0,
    });

    list = (
      await call(setItemRoute, 'PATCH', `/v1/me/lists/${id}/items/${RIZ_5KG}`, {
        ...opts({ quantity: 1 }, RIZ_5KG),
      })
    ).body;
    expect(list.lines[0].requestedQuantity).toBe(1);

    list = (
      await call(removeItemRoute, 'DELETE', `/v1/me/lists/${id}/items/${CUBES}`, {
        token: c.token,
        params: { id, variantId: CUBES },
      })
    ).body;
    expect(list.lines).toHaveLength(1);

    list = (
      await call(renameRoute, 'PATCH', `/v1/me/lists/${id}`, opts({ name: '  Restaurant  ' }))
    ).body;
    expect(list.name).toBe('Restaurant');

    const index = (await call(listsRoute, 'GET', '/v1/me/lists', { token: c.token })).body;
    expect(index.items).toEqual([
      expect.objectContaining({ id, name: 'Restaurant', itemCount: 1 }),
    ]);

    const after = await call(deleteListRoute, 'DELETE', `/v1/me/lists/${id}`, {
      token: c.token,
      params: { id },
    });
    expect(after.body.items).toEqual([]);
  });

  it('stock limité : quantité de la liste gardée, quantité disponible réduite', async () => {
    const c = await customer();
    const created = await call(createListRoute, 'POST', '/v1/me/lists', {
      token: c.token,
      body: { name: 'Gros', lines: [{ variantId: RIZ_50KG, quantity: 8 }] },
    });
    expect(created.body.lines[0]).toMatchObject({
      requestedQuantity: 8,
      quantity: 5,
      status: 'quantity_reduced',
    });
  });

  it('une liste ne se voit et ne se modifie que par son propriétaire', async () => {
    const owner = await customer();
    const other = await customer();
    const created = await call(createListRoute, 'POST', '/v1/me/lists', {
      token: owner.token,
      body: { name: 'Privée' },
    });
    const id = created.body.id as string;
    expect(
      (await call(listRoute, 'GET', `/v1/me/lists/${id}`, { token: other.token, params: { id } }))
        .status,
    ).toBe(404);
    expect(
      (
        await call(renameRoute, 'PATCH', `/v1/me/lists/${id}`, {
          token: other.token,
          params: { id },
          body: { name: 'Volée' },
        })
      ).status,
    ).toBe(404);
  });

  it('enregistrer une commande passée comme liste', async () => {
    const c = await customer();
    const address = await createAddress(t.db, c.id, {
      label: 'Maison',
      recipientName: 'Akpéné',
      phone: '+22890112233',
      district: 'Tokoin',
      city: 'Lomé',
      landmark: 'Pharmacie',
      instructions: null,
      location: null,
      isDefault: true,
    });
    const who = { id: c.id, segment: 'retail' };
    const options = await getDeliveryOptions(t.db, who, address.id);
    const quote = await createQuote(t.db, who, {
      fulfillment: 'delivery',
      addressId: address.id,
      agencyId: null,
      slotId: options.delivery!.slots.find((x) => x.available)!.id,
      paymentMethod: 'cash_on_delivery',
      useCredit: false,
      lines: [
        {
          variantId: RIZ_5KG,
          quantity: 3,
          expectedUnitPrice: 4750,
          expectedAvailability: 'available',
        },
      ],
    });
    const order = await createOrder(t.db, who, quote.quoteId, `cle-lst-${++seq}-xxxxxxxx`);

    const created = await call(createListRoute, 'POST', '/v1/me/lists', {
      token: c.token,
      body: { name: 'Comme la dernière fois', fromOrderId: order.id },
    });
    expect(created.body.lines).toEqual([
      expect.objectContaining({ variantId: RIZ_5KG, requestedQuantity: 3 }),
    ]);

    const stranger = await customer();
    const stolen = await call(createListRoute, 'POST', '/v1/me/lists', {
      token: stranger.token,
      body: { name: 'Copie', fromOrderId: order.id },
    });
    expect(stolen.status).toBe(404);
  });

  it('nom obligatoire, 20 listes au maximum', async () => {
    const c = await customer();
    expect(
      (
        await call(createListRoute, 'POST', '/v1/me/lists', {
          token: c.token,
          body: { name: '  ' },
        })
      ).status,
    ).toBe(400);
    for (let i = 0; i < 20; i++)
      await call(createListRoute, 'POST', '/v1/me/lists', {
        token: c.token,
        body: { name: `L${i}` },
      });
    const tooMany = await call(createListRoute, 'POST', '/v1/me/lists', {
      token: c.token,
      body: { name: 'Une de trop' },
    });
    expect(tooMany.status).toBe(422);
  });
});
