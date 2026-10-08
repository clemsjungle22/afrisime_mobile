import { mockProducts, mockStock } from '@afrisime/fixtures';
import { type CartValidateLine, validateCart } from '@afrisime/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as validateRoute } from '@/app/v1/cart/validate/route';
import { GET as getCartRoute, PUT as putCartRoute } from '@/app/v1/cart/route';
import { DELETE as deleteAddressRoute, PATCH as patchAddressRoute } from '@/app/v1/me/addresses/[id]/route';
import { GET as listAddressesRoute, POST as createAddressRoute } from '@/app/v1/me/addresses/route';
import { GET as meRoute, PATCH as patchMeRoute } from '@/app/v1/me/route';
import { GET as productRoute } from '@/app/v1/products/[slug]/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateCatalog } from '@/server/catalog/service';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;

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

/** Nouveau client connecté (sans passer par le SMS, déjà testé à part). */
async function newCustomer() {
  const id = `usr_test_${++seq}`;
  await t.db.insert(s.customers).values({ id, phone: `+2287${String(1000000 + seq).slice(-7)}` });
  const tokens = await createSession(t.db, id, null);
  return { id, token: tokens.accessToken };
}

const ADDRESS = {
  label: 'Maison',
  recipientName: 'Ama Koffi',
  phone: '+22890112233',
  district: 'Tokoin',
  city: 'Lomé',
  landmark: 'Derrière la pharmacie du Rond-point',
  instructions: null,
  location: { latitude: 6.14, longitude: 1.22, accuracy: 12 },
  isDefault: false,
};

describe('profil', () => {
  it('compléter le profil le rend complet', async () => {
    const { token } = await newCustomer();
    const res = await call(patchMeRoute, 'PATCH', '/v1/me', {
      token,
      body: {
        firstName: 'Ama',
        lastName: 'Koffi',
        customerTypeId: 'particulier',
        agencyId: 'agc_lome_be',
        consents: { marketing: true, termsVersion: '2026-10' },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ profileComplete: true, segmentLabel: 'Particulier', customerTypePending: false });
    expect((await call(meRoute, 'GET', '/v1/me', { token })).body.firstName).toBe('Ama');
  });

  it('un type professionnel reste en attente, sans prix pro', async () => {
    const { id, token } = await newCustomer();
    const res = await call(patchMeRoute, 'PATCH', '/v1/me', { token, body: { customerTypeId: 'revendeur' } });
    expect(res.body).toMatchObject({ customerTypeId: 'revendeur', customerTypePending: true, segmentLabel: 'Particulier' });
    const [row] = await t.db.select().from(s.customers).where(eq(s.customers.id, id));
    expect(row?.segment).toBe('retail');
    const audit = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, id));
    expect(audit.map((a) => a.action)).toContain('customer.type_changed');
  });

  it.each([
    [{ customerTypeId: 'inconnu' }, 'Type de client inconnu.'],
    [{ agencyId: 'agc_inconnue' }, 'Agence inconnue.'],
    [{ consents: { termsVersion: '2001-01' } }, "Ces conditions d'utilisation ne sont plus en vigueur."],
  ])('valeur refusée %j → 422', async (body, message) => {
    const { token } = await newCustomer();
    const res = await call(patchMeRoute, 'PATCH', '/v1/me', { token, body });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message });
  });
});

describe('prix selon le client', () => {
  it('un client pro validé voit son prix ; la réponse n’est pas mise en cache', async () => {
    const { id, token } = await newCustomer();
    await t.db.update(s.customers).set({ segment: 'pro' }).where(eq(s.customers.id, id));
    await t.db.insert(s.prices).values({ variantId: 'var_riz-parfume-savana_0', segment: 'pro', amount: 4400 });
    invalidateCatalog();
    const params = { slug: 'riz-parfume-savana' };

    const pro = await call(productRoute, 'GET', '/v1/products/riz-parfume-savana', { token, params });
    expect(pro.body.variants[0].price).toBe(4400);
    expect(pro.headers.get('cache-control')).toBe('private, no-store');

    const visitor = await call(productRoute, 'GET', '/v1/products/riz-parfume-savana', { params });
    expect(visitor.body.variants[0].price).toBe(4750);
    expect(visitor.headers.get('cache-control')).toContain('public');
  });
});

describe('adresses', () => {
  it('la zone est attribuée par le serveur ; la première adresse devient celle par défaut', async () => {
    const { token } = await newCustomer();
    const res = await call(createAddressRoute, 'POST', '/v1/me/addresses', { token, body: ADDRESS });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ isDefault: true, zoneId: 'zone_1', zoneName: 'Zone 1 · Centre', location: ADDRESS.location });

    const far = await call(createAddressRoute, 'POST', '/v1/me/addresses', {
      token,
      body: { ...ADDRESS, label: 'Kara', city: 'Kara', district: 'Centre' },
    });
    expect(far.body).toMatchObject({ isDefault: false, zoneId: null, zoneName: null });
  });

  it('accents et casse ignorés pour le quartier', async () => {
    const { token } = await newCustomer();
    const res = await call(createAddressRoute, 'POST', '/v1/me/addresses', {
      token,
      body: { ...ADDRESS, district: 'agoe', city: 'LOME' },
    });
    expect(res.body.zoneId).toBe('zone_2');
  });

  it('une seule adresse par défaut ; la supprimer en désigne une autre', async () => {
    const { token } = await newCustomer();
    const a = (await call(createAddressRoute, 'POST', '/v1/me/addresses', { token, body: ADDRESS })).body;
    const b = (await call(createAddressRoute, 'POST', '/v1/me/addresses', { token, body: { ...ADDRESS, label: 'Bureau', isDefault: true } })).body;
    let list = (await call(listAddressesRoute, 'GET', '/v1/me/addresses', { token })).body;
    expect(list.filter((x: { isDefault: boolean }) => x.isDefault).map((x: { id: string }) => x.id)).toEqual([b.id]);

    const del = await call(deleteAddressRoute, 'DELETE', `/v1/me/addresses/${b.id}`, { token, params: { id: b.id } });
    expect(del.status).toBe(204);
    list = (await call(listAddressesRoute, 'GET', '/v1/me/addresses', { token })).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: a.id, isDefault: true });
  });

  it('modifier recalcule la zone', async () => {
    const { token } = await newCustomer();
    const a = (await call(createAddressRoute, 'POST', '/v1/me/addresses', { token, body: ADDRESS })).body;
    const res = await call(patchAddressRoute, 'PATCH', `/v1/me/addresses/${a.id}`, {
      token,
      params: { id: a.id },
      body: { ...ADDRESS, district: 'Baguida' },
    });
    expect(res.body).toMatchObject({ zoneId: 'zone_3', district: 'Baguida' });
  });

  it("impossible de toucher à l'adresse d'un autre client (404)", async () => {
    const owner = await newCustomer();
    const other = await newCustomer();
    const a = (await call(createAddressRoute, 'POST', '/v1/me/addresses', { token: owner.token, body: ADDRESS })).body;
    const res = await call(patchAddressRoute, 'PATCH', `/v1/me/addresses/${a.id}`, {
      token: other.token,
      params: { id: a.id },
      body: { ...ADDRESS, label: 'Piratée' },
    });
    expect(res.status).toBe(404);
    await call(deleteAddressRoute, 'DELETE', `/v1/me/addresses/${a.id}`, { token: other.token, params: { id: a.id } });
    const mine = (await call(listAddressesRoute, 'GET', '/v1/me/addresses', { token: owner.token })).body;
    expect(mine).toEqual([expect.objectContaining({ id: a.id, label: 'Maison' })]);
  });

  it('sans connexion → 401', async () => {
    expect((await call(listAddressesRoute, 'GET', '/v1/me/addresses')).status).toBe(401);
  });
});

describe('panier enregistré', () => {
  it('vide au départ, puis conservé et retrouvé depuis une autre session', async () => {
    const { id, token } = await newCustomer();
    expect((await call(getCartRoute, 'GET', '/v1/cart', { token })).body.lines).toEqual([]);

    const lines = [
      { variantId: 'var_riz-parfume-savana_0', quantity: 2 },
      { variantId: 'var_riz-parfume-savana_0', quantity: 1 },
      { variantId: 'var_huile-vegetale-golfe-dor_0', quantity: 3 },
    ];
    const put = await call(putCartRoute, 'PUT', '/v1/cart', { token, body: { lines } });
    expect(put.body.lines).toEqual([
      { variantId: 'var_riz-parfume-savana_0', quantity: 3 },
      { variantId: 'var_huile-vegetale-golfe-dor_0', quantity: 3 },
    ]);

    const otherDevice = await createSession(t.db, id, null);
    expect((await call(getCartRoute, 'GET', '/v1/cart', { token: otherDevice.accessToken })).body.lines).toEqual(put.body.lines);
  });
});

describe('revalidation du panier : identique au mode démo', () => {
  const line = (variantId: string, quantity: number, expectedUnitPrice: number | null): CartValidateLine => ({
    variantId,
    quantity,
    expectedUnitPrice,
    expectedAvailability: 'available',
  });

  const CASES: [string, CartValidateLine[]][] = [
    ['nominal', [line('var_riz-parfume-savana_0', 2, 4750), line('var_huile-vegetale-golfe-dor_0', 3, 1300)]],
    ['prix changé', [line('var_riz-parfume-savana_0', 1, 4900)]],
    ['stock limité', [line('var_riz-parfume-savana_2', 8, 43500)]],
    ['indisponible', [line('var_cubes-assaisonnement_0', 2, 1200), line('var_huile-vegetale-golfe-dor_0', 1, 1300)]],
    ['format inconnu', [line('var_inexistante', 1, 1000)]],
    ['sur commande', [line('var_huile-de-palme-rouge_0', 2, 1200)]],
  ];

  it.each(CASES)('%s', async (_name, lines) => {
    const res = await call(validateRoute, 'POST', '/v1/cart/validate', { body: { lines } });
    expect(res.status).toBe(200);
    const demo = validateCart({ lines }, { products: mockProducts, stock: mockStock });
    const { validatedAt: _a, ...server } = res.body;
    const { validatedAt: _b, ...expected } = demo;
    expect(server).toEqual(expected);
  });

  it('les formats non limités ne révèlent pas leur stock', async () => {
    const res = await call(validateRoute, 'POST', '/v1/cart/validate', {
      body: { lines: [line('var_huile-vegetale-golfe-dor_0', 1, 1300)] },
    });
    expect(res.body.lines[0].maxQuantity).toBeNull();
  });
});
