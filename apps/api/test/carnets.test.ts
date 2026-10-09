import type { AdminRole } from '@afrisime/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as cashRoute } from '@/app/v1/admin/carnets/[id]/cash/route';
import { GET as adminCarnetRoute } from '@/app/v1/admin/carnets/[id]/route';
import { GET as adminCarnetsRoute } from '@/app/v1/admin/carnets/route';
import { PATCH as packRoute } from '@/app/v1/admin/packs/[id]/route';
import { GET as adminPacksRoute, POST as newPackRoute } from '@/app/v1/admin/packs/route';
import { POST as contributeRoute } from '@/app/v1/me/carnets/[id]/contributions/route';
import { GET as carnetRoute } from '@/app/v1/me/carnets/route';
import { POST as subscribeRoute } from '@/app/v1/me/carnets/route';
import { GET as packsRoute } from '@/app/v1/packs/route';
import { POST as webhookRoute } from '@/app/v1/webhooks/payments/[provider]/route';
import { login } from '@/server/admin/auth';
import { hashPassword } from '@/server/admin/crypto';
import { createSession } from '@/server/auth/sessions';
import { contribute, getCarnet, subscribe } from '@/server/carnets/service';
import { invalidateCatalog } from '@/server/catalog/service';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import {
  SIM_CONFIRM_MS,
  SIM_FAIL_MS,
  SIGNATURE_HEADER,
  signWebhook,
} from '@/server/payments/provider';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;
const PASSWORD = 'mot-de-passe-equipe-2026';
const tokens: Partial<Record<AdminRole, string>> = {};
const DAY = 86_400_000;
const key = () => `cle-carnet-${++seq}-xxxxxxxx`;

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  invalidateCatalog();
  const hash = await hashPassword(PASSWORD);
  for (const role of ['admin', 'catalog', 'orders', 'support'] as AdminRole[]) {
    const email = `${role}@equipe.test`;
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

async function customer() {
  const id = `usr_car_${++seq}`;
  await t.db
    .insert(s.customers)
    .values({
      id,
      phone: `+2289${String(8400000 + seq).slice(-7)}`,
      firstName: 'Abla',
      lastName: `Cliente${seq}`,
    });
  const session = await createSession(t.db, id, null);
  return { id, token: session.accessToken };
}

const as = (role: AdminRole) => ({ token: tokens[role]! });

describe('packs proposés', () => {
  it('Quinzaine et Trentaine : contenu, cotisation journalière, moins cher que les produits au détail', async () => {
    const res = await call(packsRoute, 'GET', '/v1/packs');
    expect(res.status).toBe(200);
    const quinzaine = res.body.items.find((p: { id: string }) => p.id === 'pack_quinzaine');
    expect(quinzaine).toMatchObject({ price: 19_500, durationDays: 15, dailyAmount: 1300 });
    expect(quinzaine.items).toHaveLength(6);
    expect(quinzaine.catalogValue).toBeGreaterThan(quinzaine.price);
  });
});

describe('souscription', () => {
  it('rejouée avec la même clé : un seul carnet ; clé obligatoire ; 3 carnets en cours au maximum', async () => {
    const c = await customer();
    const k = key();
    const sub = () =>
      call(subscribeRoute, 'POST', '/v1/me/carnets', {
        token: c.token,
        body: { packId: 'pack_quinzaine' },
        headers: { 'idempotency-key': k },
      });
    const first = await sub();
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      status: 'active',
      paid: 0,
      remaining: 19_500,
      dailyAmount: 1300,
      daysLate: 0,
    });
    expect((await sub()).body.id).toBe(first.body.id);
    expect(
      (
        await call(subscribeRoute, 'POST', '/v1/me/carnets', {
          token: c.token,
          body: { packId: 'pack_quinzaine' },
        })
      ).status,
    ).toBe(400);

    for (let i = 0; i < 2; i++) await subscribe(t.db, c, 'pack_trentaine', key());
    await expect(subscribe(t.db, c, 'pack_trentaine', key())).rejects.toMatchObject({
      status: 422,
    });
    expect(
      (await call(carnetRoute, 'GET', '/v1/me/carnets', { token: c.token })).body.items,
    ).toHaveLength(3);
  });

  it('contenu et prix figés : modifier le pack ne change pas les carnets ouverts', async () => {
    const c = await customer();
    const carnet = await subscribe(t.db, c, 'pack_trentaine', key());
    const packs = (await call(adminPacksRoute, 'GET', '/v1/admin/packs', as('catalog'))).body;
    const trentaine = packs.find((p: { id: string }) => p.id === 'pack_trentaine');
    await call(packRoute, 'PATCH', '/v1/admin/packs/pack_trentaine', {
      ...as('catalog'),
      params: { id: 'pack_trentaine' },
      body: {
        name: trentaine.name,
        description: trentaine.description,
        price: 52_000,
        durationDays: 30,
        items: trentaine.items.map((i: { variantId: string; quantity: number }) => ({
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        isActive: true,
      },
    });
    const after = await getCarnet(t.db, c, carnet.id);
    expect(after.price).toBe(48_000);
    expect(after.items).toEqual(carnet.items);
  });
});

describe('cotisations Mobile Money', () => {
  it('confirmée : ajoutée au carnet ; une seule demande en cours ; refusée : rien n’est ajouté', async () => {
    const c = await customer();
    const T0 = new Date();
    const carnet = await subscribe(t.db, c, 'pack_quinzaine', key(), T0);

    const pending = await contribute(
      t.db,
      c,
      carnet.id,
      { amount: 1300, method: 'mixx', phone: '+22890112233' },
      key(),
      T0,
    );
    expect(pending.pendingContribution).toMatchObject({
      amount: 1300,
      status: 'pending',
      action: { type: 'confirm_on_phone' },
    });
    // Second appui pendant l'attente : aucune nouvelle demande.
    const again = await contribute(
      t.db,
      c,
      carnet.id,
      { amount: 5000, method: 'mixx', phone: '+22890112233' },
      key(),
      T0,
    );
    expect(again.contributions).toHaveLength(1);

    const done = await getCarnet(
      t.db,
      c,
      carnet.id,
      new Date(T0.getTime() + SIM_CONFIRM_MS + 1000),
    );
    expect(done).toMatchObject({ paid: 1300, remaining: 18_200, pendingContribution: null });
    expect(done.contributions[0]).toMatchObject({ status: 'succeeded', method: 'mixx' });

    const T1 = new Date(T0.getTime() + 10_000);
    await contribute(
      t.db,
      c,
      carnet.id,
      { amount: 2000, method: 'flooz', phone: '+22890110002' },
      key(),
      T1,
    );
    const refused = await getCarnet(
      t.db,
      c,
      carnet.id,
      new Date(T1.getTime() + SIM_FAIL_MS + 1000),
    );
    expect(refused.paid).toBe(1300);
    expect(refused.contributions[0]).toMatchObject({
      status: 'failed',
      failureReason: expect.stringContaining('refusé'),
    });
  });

  it('montant : au moins 100 F, jamais plus que le reste', async () => {
    const c = await customer();
    const carnet = await subscribe(t.db, c, 'pack_quinzaine', key());
    const send = (amount: number) =>
      call(contributeRoute, 'POST', `/v1/me/carnets/${carnet.id}/contributions`, {
        token: c.token,
        params: { id: carnet.id },
        body: { amount, method: 'mixx', phone: '+22890112233' },
        headers: { 'idempotency-key': key() },
      });
    expect((await send(50)).status).toBe(422);
    expect((await send(20_000)).body.error.message).toMatch(/19500 F/);
    expect((await send(1300)).status).toBe(201);
  });

  it('webhook du prestataire : la cotisation est confirmée sans attendre la vérification', async () => {
    const c = await customer();
    const carnet = await subscribe(t.db, c, 'pack_quinzaine', key());
    const pending = await contribute(
      t.db,
      c,
      carnet.id,
      { amount: 1500, method: 'mixx', phone: '+22890112233' },
      key(),
    );
    const body = JSON.stringify({
      eventId: `evt_${seq}`,
      reference: `sim_${pending.pendingContribution!.id}`,
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
    expect((await getCarnet(t.db, c, carnet.id)).paid).toBe(1500);
  });
});

describe('retard', () => {
  it('jours passés sans cotisation comptés ; le jour même ne compte pas encore', async () => {
    const c = await customer();
    const T0 = new Date('2026-10-05T09:00:00.000Z');
    const carnet = await subscribe(t.db, c, 'pack_quinzaine', key(), T0);
    expect(
      (await getCarnet(t.db, c, carnet.id, new Date('2026-10-05T20:00:00.000Z'))).daysLate,
    ).toBe(0);
    const later = await getCarnet(t.db, c, carnet.id, new Date(T0.getTime() + 3 * DAY));
    expect(later).toMatchObject({ daysLate: 3, expectedToDate: 4 * 1300 });
  });
});

describe('back-office', () => {
  it('packs : création par le catalogue, refusée au rôle commandes ; produit inconnu refusé', async () => {
    const body = {
      name: 'Pack Revendeur',
      description: '',
      price: 30_000,
      durationDays: 20,
      items: [
        { variantId: 'var_riz-parfume-savana_1', quantity: 1 },
        { variantId: 'var_riz-parfume-savana_1', quantity: 1 },
      ],
      isActive: true,
    };
    expect(
      (await call(newPackRoute, 'POST', '/v1/admin/packs', { ...as('orders'), body })).status,
    ).toBe(403);
    const created = await call(newPackRoute, 'POST', '/v1/admin/packs', { ...as('catalog'), body });
    expect(created.status).toBe(201);
    const pack = created.body.find((p: { name: string }) => p.name === 'Pack Revendeur');
    expect(pack).toMatchObject({
      dailyAmount: 1500,
      description: null,
      items: [expect.objectContaining({ quantity: 2 })],
    });
    const bad = await call(newPackRoute, 'POST', '/v1/admin/packs', {
      ...as('catalog'),
      body: { ...body, items: [{ variantId: 'var_inconnu', quantity: 1 }] },
    });
    expect(bad.status).toBe(422);
  });

  it('espèces en agence : réservé au comptoir, solde le carnet, tracé ; plus rien après', async () => {
    const c = await customer();
    const carnet = await subscribe(t.db, c, 'pack_quinzaine', key());
    const cash = (amount: number, role: AdminRole = 'orders') =>
      call(cashRoute, 'POST', `/v1/admin/carnets/${carnet.id}/cash`, {
        ...as(role),
        params: { id: carnet.id },
        body: { amount, agencyId: 'agc_lome_centre', note: 'Reçu n°12' },
      });
    expect((await cash(1300, 'support')).status).toBe(403);
    const first = await cash(1300);
    expect(first.body).toMatchObject({ paid: 1300, canRecordCash: true });
    expect(first.body.contributions[0]).toMatchObject({
      method: 'cash',
      agencyName: 'Lomé Centre',
      recordedBy: 'Équipe orders',
      note: 'Reçu n°12',
    });

    const rest = await cash(18_200);
    expect(rest.body).toMatchObject({ status: 'completed', remaining: 0, canRecordCash: false });
    expect((await cash(100)).status).toBe(422);

    const mine = (await call(carnetRoute, 'GET', '/v1/me/carnets', { token: c.token })).body
      .items[0];
    expect(mine).toMatchObject({ status: 'completed', paid: 19_500 });
    expect(mine.contributions[0]).toMatchObject({ method: 'cash', agencyName: 'Lomé Centre' });

    const audit = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, carnet.id));
    expect(audit.filter((a) => a.action === 'carnet.cash_recorded')).toHaveLength(2);
  });

  it('liste des carnets : filtres en retard et soldés, recherche ; fiche', async () => {
    const list = (
      await call(adminCarnetsRoute, 'GET', '/v1/admin/carnets?filter=completed', as('support'))
    ).body;
    expect(list.counts.completed).toBeGreaterThanOrEqual(1);
    expect(list.items.every((r: { status: string }) => r.status === 'completed')).toBe(true);
    const late = (
      await call(adminCarnetsRoute, 'GET', '/v1/admin/carnets?filter=late', as('support'))
    ).body;
    expect(late.items.every((r: { daysLate: number }) => r.daysLate > 0)).toBe(true);
    const found = (
      await call(
        adminCarnetsRoute,
        'GET',
        '/v1/admin/carnets?filter=all&q=Quinzaine',
        as('support'),
      )
    ).body;
    expect(found.items.length).toBeGreaterThan(0);
    const id = found.items[0].id;
    const detail = await call(adminCarnetRoute, 'GET', `/v1/admin/carnets/${id}`, {
      ...as('support'),
      params: { id },
    });
    expect(detail.body).toMatchObject({ canRecordCash: false, items: expect.any(Array) });
    expect((await call(adminCarnetsRoute, 'GET', '/v1/admin/carnets', as('catalog'))).status).toBe(
      403,
    );
  });
});
