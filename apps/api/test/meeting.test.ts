import type { AdminRole } from '@afrisime/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GET as adminProductRoute,
  PATCH as patchProductRoute,
} from '@/app/v1/admin/catalog/products/[id]/route';
import { POST as kycReviewRoute } from '@/app/v1/admin/customers/[id]/kyc/route';
import { GET as adminCustomerRoute } from '@/app/v1/admin/customers/[id]/route';
import { PUT as rulesRoute } from '@/app/v1/admin/settings/delivery/rules/route';
import { GET as kycPhotoRoute } from '@/app/v1/kyc-photo/route';
import { GET as getKycRoute, POST as submitKycRoute } from '@/app/v1/me/kyc/route';
import { GET as productRoute } from '@/app/v1/products/[slug]/route';
import { GET as publicMediaRoute } from '@/app/media/[...key]/route';
import { login } from '@/server/admin/auth';
import { hashPassword } from '@/server/admin/crypto';
import { createSession } from '@/server/auth/sessions';
import { validate } from '@/server/cart/service';
import { invalidateCatalog } from '@/server/catalog/service';
import { createQuote, getDeliveryOptions } from '@/server/checkout/service';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { type MediaStorage, setMediaStorage } from '@/server/media';
import { listNotifications } from '@/server/notifications/service';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
const tokens: Partial<Record<AdminRole, string>> = {};
const files = new Map<string, Buffer>();
const memory: MediaStorage = {
  async put(key, data) {
    files.set(key, data);
  },
  async get(key) {
    const data = files.get(key);
    return data ? { data, contentType: 'image/webp' } : null;
  },
  async remove(key) {
    files.delete(key);
  },
};

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  setMediaStorage(memory);
  invalidateCatalog();
  const hash = await hashPassword('mot-de-passe-reunion');
  for (const role of ['admin', 'support'] as AdminRole[]) {
    const email = `${role}@reunion.test`;
    await t.db
      .insert(s.adminUsers)
      .values({
        id: `adm_reu_${role}`,
        email,
        name: `Équipe ${role}`,
        role: role === 'admin' ? 'orders' : role,
        passwordHash: hash,
        mustChangePassword: false,
      });
    tokens[role] = (
      (await login(
        t.db,
        { email, password: 'mot-de-passe-reunion' },
        { ip: '1.1.1.1', userAgent: null },
      )) as { token: string }
    ).token;
  }
  await t.db
    .update(s.adminUsers)
    .set({ role: 'admin' })
    .where(eq(s.adminUsers.id, 'adm_reu_admin'));
});
afterAll(async () => {
  setMediaStorage(null);
  setDb(null);
  invalidateCatalog();
  await t.close();
});

let seq = 0;
async function customer() {
  const id = `usr_reu_${++seq}`;
  await t.db
    .insert(s.customers)
    .values({
      id,
      phone: `+2289${String(8800000 + seq).slice(-7)}`,
      firstName: 'Yawa',
      lastName: `Réunion${seq}`,
    });
  const session = await createSession(t.db, id, null);
  return { id, segment: 'retail', token: session.accessToken };
}

describe('fourchette de prix', () => {
  it('saisie dans le back-office, affichée sur la fiche ; incohérente refusée', async () => {
    const before = await call(adminProductRoute, 'GET', '/v1/admin/catalog/products/prd_0001', {
      token: tokens.admin,
      params: { id: 'prd_0001' },
    });
    const { id: _i, slug, createdAt: _c, updatedAt: _u, variants: _v, ...input } = before.body;
    const bad = await call(patchProductRoute, 'PATCH', '/v1/admin/catalog/products/prd_0001', {
      token: tokens.admin,
      params: { id: 'prd_0001' },
      body: { ...input, priceMin: 6000, priceMax: 4000 },
    });
    expect(bad.status).toBe(400);
    const ok = await call(patchProductRoute, 'PATCH', '/v1/admin/catalog/products/prd_0001', {
      token: tokens.admin,
      params: { id: 'prd_0001' },
      body: { ...input, priceMin: 4500, priceMax: 5200 },
    });
    expect(ok.body).toMatchObject({ priceMin: 4500, priceMax: 5200 });
    const app = await call(productRoute, 'GET', `/v1/products/${slug}`, { params: { slug } });
    expect(app.body.priceRange).toEqual({ min: 4500, max: 5200 });
  });
});

describe('vérification d’identité (KYC)', () => {
  const photo = () =>
    sharp({ create: { width: 64, height: 40, channels: 3, background: '#88aa55' } })
      .jpeg()
      .toBuffer();

  async function quote(c: Awaited<ReturnType<typeof customer>>, quantity: number) {
    const opts = await getDeliveryOptions(t.db, c, null);
    const agency = opts.pickup.agencies[0]!;
    const base = {
      variantId: 'var_riz-parfume-savana_0',
      quantity,
      expectedUnitPrice: null,
      expectedAvailability: 'available' as const,
    };
    const price = (await validate({ lines: [base] }, c.segment)).lines[0]!.unitPrice;
    return createQuote(t.db, c, {
      fulfillment: 'pickup',
      addressId: null,
      agencyId: agency.agencyId,
      slotId: agency.slots.find((x) => x.available)!.id,
      paymentMethod: 'pay_at_agency',
      useCredit: false,
      lines: [{ ...base, expectedUnitPrice: price }],
    });
  }

  it('au-delà du seuil sur 30 jours : dossier exigé, vérifié par l’équipe, puis commande possible', async () => {
    await call(rulesRoute, 'PUT', '/v1/admin/settings/delivery/rules', {
      token: tokens.admin,
      body: {
        freeAbove: 50_000,
        minOrder: 2_000,
        cashOnDeliveryMax: 100_000,
        leadTimeMinutes: 60,
        mobileMoneyBonus: 500,
        kycThreshold: 8_000,
      },
    });
    const c = await customer();
    expect((await call(getKycRoute, 'GET', '/v1/me/kyc', { token: c.token })).body).toMatchObject({
      status: 'none',
      threshold: 8_000,
      spent30d: 0,
      remainingBeforeKyc: 8_000,
    });
    await expect(quote(c, 2)).rejects.toMatchObject({
      code: 'KYC_REQUIRED',
      details: { threshold: 8_000, status: 'none' },
    });

    // Dossier : recto, verso, selfie.
    const form = new FormData();
    form.set('docType', 'cni');
    form.set('docNumber', 'TG-0012345');
    for (const kind of ['front', 'back', 'selfie'])
      form.set(kind, new File([await photo()], `${kind}.jpg`, { type: 'image/jpeg' }));
    const sent = await submitKycRoute(
      new Request('http://localhost/v1/me/kyc', {
        method: 'POST',
        headers: { authorization: `Bearer ${c.token}` },
        body: form,
      }),
    );
    expect(sent.status).toBe(201);
    expect(await sent.json()).toMatchObject({ status: 'pending', docType: 'cni' });
    await expect(quote(c, 2)).rejects.toMatchObject({
      code: 'KYC_REQUIRED',
      details: { status: 'pending' },
    });

    // Équipe : photos par adresses signées uniquement (jamais par l'adresse publique).
    const detail = await call(adminCustomerRoute, 'GET', `/v1/admin/customers/${c.id}`, {
      token: tokens.support,
      params: { id: c.id },
    });
    expect(detail.body.kyc).toMatchObject({ status: 'pending', docNumber: 'TG-0012345' });
    expect(detail.body.allowedActions).toContain('review_kyc');
    expect(detail.body.kyc.photos.map((p: { kind: string }) => p.kind)).toEqual([
      'front',
      'back',
      'selfie',
    ]);
    const signed = new URL(detail.body.kyc.photos[0].url, 'http://localhost');
    expect((await kycPhotoRoute(new Request(signed))).status).toBe(200);
    signed.searchParams.set('sig', 'falsifiee');
    expect((await kycPhotoRoute(new Request(signed))).status).toBe(404);
    const key = signed.searchParams.get('key')!;
    const pub = await publicMediaRoute(new Request(`http://localhost/media/${key}`), {
      params: Promise.resolve({ key: key.split('/') }),
    });
    expect(pub.status).toBe(404);

    const approved = await call(kycReviewRoute, 'POST', `/v1/admin/customers/${c.id}/kyc`, {
      token: tokens.support,
      params: { id: c.id },
      body: { decision: 'approve' },
    });
    expect(approved.body.kyc).toMatchObject({ status: 'verified', reviewedBy: 'Équipe support' });
    expect((await listNotifications(t.db, c.id)).items[0]).toMatchObject({
      title: 'Identité vérifiée',
    });
    expect((await quote(c, 2)).total).toBeGreaterThan(8_000);
  });

  it('refus avec motif : le client peut renvoyer un dossier', async () => {
    const c = await customer();
    const form = new FormData();
    form.set('docType', 'passport');
    form.set('docNumber', 'P1234567');
    for (const kind of ['front', 'selfie'])
      form.set(kind, new File([await photo()], `${kind}.jpg`, { type: 'image/jpeg' }));
    const sent = await submitKycRoute(
      new Request('http://localhost/v1/me/kyc', {
        method: 'POST',
        headers: { authorization: `Bearer ${c.token}` },
        body: form,
      }),
    );
    expect(sent.status).toBe(201);
    const noReason = await call(kycReviewRoute, 'POST', `/v1/admin/customers/${c.id}/kyc`, {
      token: tokens.admin,
      params: { id: c.id },
      body: { decision: 'reject' },
    });
    expect(noReason.status).toBe(400);
    await call(kycReviewRoute, 'POST', `/v1/admin/customers/${c.id}/kyc`, {
      token: tokens.admin,
      params: { id: c.id },
      body: { decision: 'reject', reason: 'Photo floue' },
    });
    expect((await call(getKycRoute, 'GET', '/v1/me/kyc', { token: c.token })).body).toMatchObject({
      status: 'rejected',
      reason: 'Photo floue',
    });
  });
});
