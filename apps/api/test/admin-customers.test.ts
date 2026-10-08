import type { AdminRole } from '@afrisime/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as blockRoute } from '@/app/v1/admin/customers/[id]/block/route';
import { POST as pricingRoute } from '@/app/v1/admin/customers/[id]/pricing/route';
import { POST as reviewRoute } from '@/app/v1/admin/customers/[id]/review/route';
import { GET as detailRoute } from '@/app/v1/admin/customers/[id]/route';
import { POST as unblockRoute } from '@/app/v1/admin/customers/[id]/unblock/route';
import { GET as listRoute } from '@/app/v1/admin/customers/route';
import { POST as requestRoute } from '@/app/v1/auth/otp/request/route';
import { GET as meRoute } from '@/app/v1/me/route';
import { login } from '@/server/admin/auth';
import { hashPassword } from '@/server/admin/crypto';
import { createSession } from '@/server/auth/sessions';
import { invalidateCatalog } from '@/server/catalog/service';
import { createQuote, getDeliveryOptions } from '@/server/checkout/service';
import { createAddress } from '@/server/customers/addresses';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { createOrder } from '@/server/orders/service';
import { setSmsSender } from '@/server/sms';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;
const PASSWORD = 'mot-de-passe-equipe-2026';
const tokens: Partial<Record<AdminRole, string>> = {};
const sms: string[] = [];

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  invalidateCatalog();
  setSmsSender({ send: async (to) => void sms.push(to) });
  const hash = await hashPassword(PASSWORD);
  for (const role of ['admin', 'orders', 'support', 'readonly', 'catalog'] as AdminRole[]) {
    const email = `${role}@equipe.test`;
    // Session ouverte sans 2FA (déjà testé ailleurs) : rôle administrateur posé après la connexion.
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
  setSmsSender(null);
  setDb(null);
  invalidateCatalog();
  await t.close();
});

/** Client inscrit dans l'app (profil déclaré, éventuellement en attente de validation). */
async function customer(
  options: { type?: string; pending?: boolean; segment?: string; name?: string } = {},
) {
  const id = `usr_cli_${++seq}`;
  const phone = `+2289${String(8100000 + seq).slice(-7)}`;
  await t.db.insert(s.customers).values({
    id,
    phone,
    firstName: options.name ?? 'Kossi',
    lastName: `Client${seq}`,
    customerTypeId: options.type ?? 'particulier',
    customerTypePending: options.pending ?? false,
    segment: options.segment ?? 'retail',
  });
  return { id, phone };
}

/** Commande passée depuis l'app (livraison payée à la livraison). */
async function order(customerId: string) {
  const address = await createAddress(t.db, customerId, {
    label: 'Boutique',
    recipientName: 'Kossi',
    phone: '+22890112233',
    district: 'Bè',
    city: 'Lomé',
    landmark: 'Face au marché',
    instructions: null,
    location: { latitude: 6.13, longitude: 1.23, accuracy: 12 },
    isDefault: true,
  });
  const c = { id: customerId, segment: 'retail' };
  const opts = await getDeliveryOptions(t.db, c, address.id);
  const quote = await createQuote(t.db, c, {
    fulfillment: 'delivery',
    addressId: address.id,
    agencyId: null,
    slotId: opts.delivery!.slots.find((x) => x.available)!.id,
    paymentMethod: 'cash_on_delivery',
    useCredit: false,
    lines: [
      {
        variantId: 'var_riz-parfume-savana_0',
        quantity: 2,
        expectedUnitPrice: 4750,
        expectedAvailability: 'available',
      },
    ],
  });
  return createOrder(t.db, c, quote.quoteId, `cle-cli-${++seq}-xxxxxx`);
}

const as = (role: AdminRole) => ({ token: tokens[role]! });
const list = (qs = '', role: AdminRole = 'support') =>
  call(listRoute, 'GET', `/v1/admin/customers${qs}`, as(role));
const detail = (id: string, role: AdminRole = 'support') =>
  call(detailRoute, 'GET', `/v1/admin/customers/${id}`, { ...as(role), params: { id } });
const post = (
  route: typeof reviewRoute,
  path: string,
  id: string,
  body: object,
  role: AdminRole = 'support',
) =>
  call(route, 'POST', `/v1/admin/customers/${id}/${path}`, { ...as(role), params: { id }, body });

describe('liste des clients', () => {
  it('filtres, compteurs et recherche par nom ou téléphone', async () => {
    const pending = await customer({ type: 'revendeur', pending: true, name: 'Ablavi' });
    await customer({ type: 'restaurant', segment: 'pro', name: 'Mawuli' });

    const all = (await list()).body;
    expect(all.counts.pending_pro).toBeGreaterThanOrEqual(1);
    expect(all.counts.all).toBe(all.counts.pro + all.counts.retail);

    const toReview = (await list('?filter=pending_pro')).body;
    expect(toReview.items.every((c: { typePending: boolean }) => c.typePending)).toBe(true);
    expect(toReview.items.find((c: { id: string }) => c.id === pending.id)).toMatchObject({
      name: expect.stringContaining('Ablavi'),
      customerType: { id: 'revendeur', label: expect.any(String) },
      segment: 'retail',
      status: 'active',
    });

    const byPhone = (await list(`?q=${pending.phone.slice(-6)}`)).body;
    expect(byPhone.items.map((c: { id: string }) => c.id)).toEqual([pending.id]);
    const byName = (await list('?q=mawuli')).body;
    expect(byName.items).toHaveLength(1);
    expect(byName.items[0].segment).toBe('pro');
  });

  it('données personnelles : interdites au rôle Catalogue', async () => {
    expect((await list('', 'catalog')).status).toBe(403);
    expect((await list('', 'readonly')).status).toBe(200);
  });
});

describe('fiche client', () => {
  it('commandes, adresses, total dépensé (commandes terminées seulement) et panier moyen', async () => {
    const c = await customer();
    const a = await order(c.id);
    const b = await order(c.id);
    await t.db.update(s.orders).set({ status: 'delivered' }).where(eq(s.orders.id, a.id));
    await createSession(t.db, c.id, null);

    const d = (await detail(c.id)).body;
    expect(d.orderCount).toBe(2);
    expect(d.totalSpent).toBe(a.total);
    expect(d.averageBasket).toBe(a.total);
    expect(d.orders.map((o: { id: string }) => o.id).sort()).toEqual([a.id, b.id].sort());
    expect(d.addresses[0]).toMatchObject({
      landmark: 'Face au marché',
      zoneName: expect.any(String),
    });
    expect(d.lastSeenAt).not.toBeNull();
    expect(d.lastOrderAt).not.toBeNull();
  });

  it('actions proposées selon le rôle', async () => {
    const c = await customer({ type: 'revendeur', pending: true });
    expect((await detail(c.id, 'support')).body.allowedActions).toEqual([
      'review_pro',
      'change_pricing',
    ]);
    expect((await detail(c.id, 'admin')).body.allowedActions).toEqual([
      'review_pro',
      'change_pricing',
      'block',
    ]);
    expect((await detail(c.id, 'orders')).body.allowedActions).toEqual([]);
    expect((await detail('usr_inconnu')).status).toBe(404);
  });
});

describe('validation des comptes pros', () => {
  it('valider : tarif pro appliqué, plus « en attente » dans l’app, historique avec l’auteur', async () => {
    const c = await customer({ type: 'revendeur', pending: true });
    const session = await createSession(t.db, c.id, null);

    const res = await post(reviewRoute, 'review', c.id, { decision: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ segment: 'pro', typePending: false });
    expect(res.body.history[0]).toMatchObject({
      label: 'Profil pro validé',
      actorName: 'Équipe support',
    });

    const me = await call(meRoute, 'GET', '/v1/me', { token: session.accessToken });
    expect(me.body).toMatchObject({ customerTypeId: 'revendeur', customerTypePending: false });
    expect(me.body.segmentLabel).toMatch(/pro/i);

    // Plus rien à valider.
    expect((await post(reviewRoute, 'review', c.id, { decision: 'approve' })).status).toBe(422);
  });

  it('refuser : motif obligatoire, retour au profil particulier et au tarif normal', async () => {
    const c = await customer({ type: 'restaurant', pending: true });
    const noReason = await post(reviewRoute, 'review', c.id, { decision: 'reject' });
    expect(noReason.status).toBe(400);

    const res = await post(reviewRoute, 'review', c.id, {
      decision: 'reject',
      reason: 'Pas de registre de commerce fourni',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      segment: 'retail',
      typePending: false,
      customerType: { id: 'particulier' },
    });
    expect(res.body.history[0]).toMatchObject({
      label: 'Profil pro refusé',
      reason: 'Pas de registre de commerce fourni',
    });
  });

  it('changer le profil et le tarif à la main : motif obligatoire, rôles limités', async () => {
    const c = await customer();
    const body = { customerTypeId: 'pme', segment: 'pro', reason: 'Client grossiste connu' };
    expect((await post(pricingRoute, 'pricing', c.id, body, 'orders')).status).toBe(403);
    expect(
      (await post(pricingRoute, 'pricing', c.id, { ...body, reason: '' }, 'support')).status,
    ).toBe(400);
    expect(
      (await post(pricingRoute, 'pricing', c.id, { ...body, customerTypeId: 'x' })).status,
    ).toBe(422);

    const res = await post(pricingRoute, 'pricing', c.id, body);
    expect(res.body).toMatchObject({ segment: 'pro', customerType: { id: 'pme' } });
    expect(res.body.history[0].reason).toBe('Client grossiste connu');
  });
});

describe('blocage', () => {
  it('bloquer : administrateur seulement, déconnecté partout, connexion refusée avec un message clair', async () => {
    const c = await customer();
    const session = await createSession(t.db, c.id, null);
    const reason = { reason: 'Fraude au paiement à la livraison' };

    expect((await post(blockRoute, 'block', c.id, reason, 'support')).status).toBe(403);
    const res = await post(blockRoute, 'block', c.id, reason, 'admin');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'blocked', allowedActions: ['unblock'] });
    expect((await list('?filter=blocked')).body.items.map((x: { id: string }) => x.id)).toContain(
      c.id,
    );

    // Session coupée tout de suite.
    expect((await call(meRoute, 'GET', '/v1/me', { token: session.accessToken })).status).toBe(401);
    // Nouvelle connexion : refusée sans envoyer de SMS.
    const before = sms.length;
    const otp = await call(requestRoute, 'POST', '/v1/auth/otp/request', {
      body: { phone: c.phone },
      headers: { 'x-forwarded-for': '10.9.9.1' },
    });
    expect(otp.status).toBe(403);
    expect(otp.body.error).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    expect(otp.body.error.message).toMatch(/service client/);
    expect(sms.length).toBe(before);
    // Validation impossible tant que le compte est bloqué.
    expect(
      (
        await post(pricingRoute, 'pricing', c.id, {
          customerTypeId: 'pme',
          segment: 'pro',
          reason: 'test ok',
        })
      ).status,
    ).toBe(422);

    const back = await post(unblockRoute, 'unblock', c.id, { reason: 'Dette réglée' }, 'admin');
    expect(back.body.status).toBe('active');
    expect(back.body.history.map((h: { label: string }) => h.label).slice(0, 2)).toEqual([
      'Compte débloqué',
      'Compte bloqué',
    ]);
    const again = await call(requestRoute, 'POST', '/v1/auth/otp/request', {
      body: { phone: c.phone },
      headers: { 'x-forwarded-for': '10.9.9.2' },
    });
    expect(again.status).toBe(200);
  });
});
