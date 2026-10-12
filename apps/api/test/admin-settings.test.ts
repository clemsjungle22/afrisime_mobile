import type { AdminRole, SlotConfig } from '@afrisime/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as agencyDefaultRoute } from '@/app/v1/admin/settings/agencies/[id]/default/route';
import { PATCH as agencyRoute } from '@/app/v1/admin/settings/agencies/[id]/route';
import {
  GET as agenciesRoute,
  POST as newAgencyRoute,
} from '@/app/v1/admin/settings/agencies/route';
import { PATCH as typeRoute } from '@/app/v1/admin/settings/customer-types/[id]/route';
import { POST as newTypeRoute } from '@/app/v1/admin/settings/customer-types/route';
import { PUT as rulesRoute } from '@/app/v1/admin/settings/delivery/rules/route';
import { GET as deliveryRoute } from '@/app/v1/admin/settings/delivery/route';
import { GET as slotsRoute, PUT as saveSlotsRoute } from '@/app/v1/admin/settings/slots/route';
import { POST as moveZoneRoute } from '@/app/v1/admin/settings/zones/[id]/move/route';
import { PATCH as zoneRoute } from '@/app/v1/admin/settings/zones/[id]/route';
import { POST as newZoneRoute } from '@/app/v1/admin/settings/zones/route';
import { POST as resetPasswordRoute } from '@/app/v1/admin/team/[id]/reset-password/route';
import { PATCH as memberRoute } from '@/app/v1/admin/team/[id]/route';
import { POST as unlockRoute } from '@/app/v1/admin/team/[id]/unlock/route';
import { GET as teamRoute, POST as newMemberRoute } from '@/app/v1/admin/team/route';
import { GET as dashboardRoute } from '@/app/v1/admin/dashboard/route';
import { login } from '@/server/admin/auth';
import { hashPassword } from '@/server/admin/crypto';
import { updateMember } from '@/server/admin/team';
import { getOnboardingOptions, invalidateCatalog } from '@/server/catalog/service';
import { createQuote, getDeliveryOptions } from '@/server/checkout/service';
import { createAddress } from '@/server/customers/addresses';
import { updateProfile } from '@/server/customers/profile';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { createOrder } from '@/server/orders/service';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;
const PASSWORD = 'mot-de-passe-equipe-2026';
const tokens: Partial<Record<AdminRole, string>> = {};

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  invalidateCatalog();
  const hash = await hashPassword(PASSWORD);
  for (const role of ['admin', 'support'] as AdminRole[]) {
    const email = `${role}@equipe.test`;
    // Session ouverte sans 2FA (déjà testé ailleurs) : rôle administrateur posé après la connexion.
    await t.db.insert(s.adminUsers).values({
      id: `adm_${role}`,
      email,
      name: `Équipe ${role}`,
      role: role === 'admin' ? 'support' : role,
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

const as = (role: AdminRole = 'admin') => ({ token: tokens[role]! });
type Handler = Parameters<typeof call>[0];
const send = (
  route: Handler,
  method: string,
  path: string,
  options: { body?: object; id?: string; role?: AdminRole } = {},
) =>
  call(route, method, path, {
    ...as(options.role),
    body: options.body,
    params: options.id ? { id: options.id } : undefined,
  });

/** Client avec une adresse dans ce quartier (la zone est attribuée à la création de l'adresse). */
async function customerIn(district: string) {
  const id = `usr_set_${++seq}`;
  await t.db
    .insert(s.customers)
    .values({ id, phone: `+2289${String(8200000 + seq).slice(-7)}`, firstName: 'Yawa' });
  const address = await createAddress(t.db, id, {
    label: 'Maison',
    recipientName: 'Yawa',
    phone: '+22890112233',
    district,
    city: 'Lomé',
    landmark: 'Près de l’école',
    instructions: null,
    location: null,
    isDefault: true,
  });
  return { customer: { id, segment: 'retail' }, address };
}

const zoneBody = {
  name: 'Zone Baguida',
  city: 'Lomé',
  fee: 2000,
  cashOnDelivery: false,
  districts: ['Klikamé', 'Aflao Gakli', 'klikame'],
  isActive: true,
};

describe('accès', () => {
  it('paramètres et équipe : administrateur seulement', async () => {
    expect(
      (await send(deliveryRoute, 'GET', '/v1/admin/settings/delivery', { role: 'support' })).status,
    ).toBe(403);
    expect((await send(teamRoute, 'GET', '/v1/admin/team', { role: 'support' })).status).toBe(403);
    expect((await send(deliveryRoute, 'GET', '/v1/admin/settings/delivery')).status).toBe(200);
  });
});

describe('livraison', () => {
  it('nouvelle zone : quartiers couverts, frais appliqués au checkout ; désactivée, plus de livraison', async () => {
    const created = await send(newZoneRoute, 'POST', '/v1/admin/settings/zones', {
      body: zoneBody,
    });
    expect(created.status).toBe(201);
    const zone = created.body.zones.find((z: { name: string }) => z.name === 'Zone Baguida');
    expect(zone.districts).toEqual(['Klikamé', 'Aflao Gakli']); // doublon retiré

    const { customer, address } = await customerIn('Klikamé');
    expect(address.zoneId).toBe(zone.id);
    const options = await getDeliveryOptions(t.db, customer, address.id);
    expect(options.delivery).toMatchObject({ available: true, fee: 2000 });

    // Un quartier déjà couvert par une autre zone active est refusé.
    const clash = await send(newZoneRoute, 'POST', '/v1/admin/settings/zones', {
      body: { ...zoneBody, name: 'Doublon', districts: ['Aflao Gakli'] },
    });
    expect(clash.status).toBe(422);
    expect(clash.body.error.message).toMatch(/Aflao Gakli.*Zone Baguida/);

    await send(zoneRoute, 'PATCH', `/v1/admin/settings/zones/${zone.id}`, {
      id: zone.id,
      body: { ...zoneBody, isActive: false },
    });
    const after = await getDeliveryOptions(t.db, customer, address.id);
    expect(after.delivery).toMatchObject({ available: false, unavailableCode: 'ZONE_NOT_SERVED' });

    const moved = await send(moveZoneRoute, 'POST', `/v1/admin/settings/zones/${zone.id}/move`, {
      id: zone.id,
      body: { direction: 'up' },
    });
    const order = moved.body.zones.map((z: { id: string }) => z.id);
    expect(order.indexOf(zone.id)).toBe(order.length - 2);
  });

  it('règles : minimum de commande et livraison offerte appliqués au checkout', async () => {
    const res = await send(rulesRoute, 'PUT', '/v1/admin/settings/delivery/rules', {
      body: { freeAbove: 30_000, minOrder: 5_000, cashOnDeliveryMax: 80_000, leadTimeMinutes: 120, mobileMoneyBonus: 300, kycThreshold: 200_000 },
    });
    expect(res.body.rules).toEqual({
      freeAbove: 30_000,
      minOrder: 5_000,
      cashOnDeliveryMax: 80_000,
      leadTimeMinutes: 120,
      mobileMoneyBonus: 300,
      kycThreshold: 200_000,
    });
    const { customer, address } = await customerIn('Tokoin');
    const options = await getDeliveryOptions(t.db, customer, address.id);
    expect(options.delivery).toMatchObject({ freeAbove: 30_000, minOrderAmount: 5_000 });
    // Montant négatif refusé.
    const bad = await send(rulesRoute, 'PUT', '/v1/admin/settings/delivery/rules', {
      body: { freeAbove: -1, minOrder: 0, cashOnDeliveryMax: 0, leadTimeMinutes: 0, mobileMoneyBonus: 0, kycThreshold: 0 },
    });
    expect(bad.status).toBe(400);
  });
});

describe('créneaux', () => {
  it('plages et jours fermés réglables ; capacité atteinte : créneau complet, commande refusée', async () => {
    const current = (await send(slotsRoute, 'GET', '/v1/admin/settings/slots')).body as SlotConfig;
    expect(current.closedDays).toEqual([0]);

    const overlap = await send(saveSlotsRoute, 'PUT', '/v1/admin/settings/slots', {
      body: {
        ...current,
        delivery: [
          { from: 8, to: 14 },
          { from: 12, to: 18 },
        ],
      },
    });
    expect(overlap.status).toBe(400);
    const allClosed = await send(saveSlotsRoute, 'PUT', '/v1/admin/settings/slots', {
      body: { ...current, closedDays: [0, 1, 2, 3, 4, 5, 6] },
    });
    expect(allClosed.status).toBe(400);

    const config: SlotConfig = {
      delivery: [{ from: 9, to: 13 }],
      pickup: [{ from: 10, to: 18 }],
      closedDays: [],
      daysAhead: 2,
      capacity: { delivery: 1, pickup: null },
    };
    expect(
      (await send(saveSlotsRoute, 'PUT', '/v1/admin/settings/slots', { body: config })).status,
    ).toBe(200);
    await send(rulesRoute, 'PUT', '/v1/admin/settings/delivery/rules', {
      body: { freeAbove: 50_000, minOrder: 2_000, cashOnDeliveryMax: 100_000, leadTimeMinutes: 0 },
    });

    const first = await customerIn('Tokoin');
    const options = await getDeliveryOptions(t.db, first.customer, first.address.id);
    const slots = options.delivery!.slots;
    expect(slots.every((x) => new Date(x.start).getUTCHours() === 9)).toBe(true);
    expect(options.pickup.agencies[0]!.slots[0]!.start).toMatch(/T10:00/);
    const slot = slots.find((x) => x.available)!;

    const request = {
      fulfillment: 'delivery' as const,
      addressId: first.address.id,
      agencyId: null,
      slotId: slot.id,
      paymentMethod: 'cash_on_delivery' as const,
      useCredit: false,
      lines: [
        {
          variantId: 'var_riz-parfume-savana_0',
          quantity: 2,
          expectedUnitPrice: 4750,
          expectedAvailability: 'available' as const,
        },
      ],
    };
    // Deux devis sur la dernière place : seule la première commande passe.
    const second = await customerIn('Tokoin');
    const q1 = await createQuote(t.db, first.customer, request);
    const q2 = await createQuote(t.db, second.customer, {
      ...request,
      addressId: second.address.id,
    });
    await createOrder(t.db, first.customer, q1.quoteId, `cle-set-${++seq}-xxxxxxxx`);
    await expect(
      createOrder(t.db, second.customer, q2.quoteId, `cle-set-${++seq}-xxxxxxxx`),
    ).rejects.toMatchObject({ code: 'SLOT_UNAVAILABLE' });

    const full = await getDeliveryOptions(t.db, second.customer, second.address.id);
    expect(full.delivery!.slots.find((x) => x.id === slot.id)).toMatchObject({ available: false });
  });
});

describe('agences', () => {
  it('nouvelle agence visible à l’inscription ; l’agence par défaut ne peut pas être désactivée', async () => {
    const res = await send(newAgencyRoute, 'POST', '/v1/admin/settings/agencies', {
      body: {
        name: 'Lomé Adidogomé',
        city: 'Lomé',
        address: 'Carrefour Adidogomé',
        phone: '',
        openingHours: 'Lun–Sam 8 h–19 h',
        isActive: true,
      },
    });
    expect(res.status).toBe(201);
    const agency = res.body.find((a: { name: string }) => a.name === 'Lomé Adidogomé');
    expect(agency).toMatchObject({ phone: null, isDefault: false, customerCount: 0 });
    expect((await getOnboardingOptions()).agencies.map((a) => a.id)).toContain(agency.id);

    const def = await send(
      agencyDefaultRoute,
      'POST',
      `/v1/admin/settings/agencies/${agency.id}/default`,
      {
        id: agency.id,
      },
    );
    expect(
      def.body.filter((a: { isDefault: boolean }) => a.isDefault).map((a: { id: string }) => a.id),
    ).toEqual([agency.id]);
    const off = await send(agencyRoute, 'PATCH', `/v1/admin/settings/agencies/${agency.id}`, {
      id: agency.id,
      body: {
        name: 'Lomé Adidogomé',
        city: 'Lomé',
        address: 'Carrefour Adidogomé',
        phone: null,
        openingHours: null,
        isActive: false,
      },
    });
    expect(off.status).toBe(422);
    expect((await send(agenciesRoute, 'GET', '/v1/admin/settings/agencies')).body).toHaveLength(4);
  });
});

describe('profils clients', () => {
  it('nouveau profil proposé à l’inscription ; désactivé, il n’est plus choisissable', async () => {
    const res = await send(newTypeRoute, 'POST', '/v1/admin/settings/customer-types', {
      body: {
        label: 'Boutique de quartier',
        description: 'Petits commerces de proximité',
        requiresReview: true,
        segment: 'pro',
        isActive: true,
      },
    });
    expect(res.status).toBe(201);
    const type = res.body.find((x: { label: string }) => x.label === 'Boutique de quartier');
    expect(type.id).toBe('boutique-de-quartier');
    expect((await getOnboardingOptions()).customerTypes.map((x) => x.id)).toContain(type.id);

    await send(typeRoute, 'PATCH', `/v1/admin/settings/customer-types/${type.id}`, {
      id: type.id,
      body: {
        label: type.label,
        description: null,
        requiresReview: true,
        segment: 'pro',
        isActive: false,
      },
    });
    expect((await getOnboardingOptions()).customerTypes.map((x) => x.id)).not.toContain(type.id);
    const { customer } = await customerIn('Bè');
    const [row] = await t.db.select().from(s.customers).where(eq(s.customers.id, customer.id));
    await expect(updateProfile(t.db, row!, { customerTypeId: type.id })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('il reste toujours un profil actif sans validation', async () => {
    const res = await send(typeRoute, 'PATCH', '/v1/admin/settings/customer-types/particulier', {
      id: 'particulier',
      body: {
        label: 'Particulier / Famille',
        description: null,
        requiresReview: false,
        segment: 'retail',
        isActive: false,
      },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/au moins un profil actif sans validation/);
  });
});

describe('équipe', () => {
  it('nouveau compte : mot de passe provisoire montré une fois, valable pour se connecter', async () => {
    const res = await send(newMemberRoute, 'POST', '/v1/admin/team', {
      body: { name: 'Ama Commandes', email: ' Ama@Equipe.test ', role: 'orders' },
    });
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({
      email: 'ama@equipe.test',
      mustChangePassword: true,
      status: 'active',
    });
    const logged = await login(
      t.db,
      { email: 'ama@equipe.test', password: res.body.temporaryPassword },
      { ip: '2.2.2.2', userAgent: null },
    );
    expect(logged).toMatchObject({ status: 'authenticated' });

    const twice = await send(newMemberRoute, 'POST', '/v1/admin/team', {
      body: { name: 'Ama bis', email: 'ama@equipe.test', role: 'orders' },
    });
    expect(twice.status).toBe(422);
  });

  it('désactiver : déconnecté tout de suite ; réinitialiser le mot de passe ; débloquer', async () => {
    const created = await send(newMemberRoute, 'POST', '/v1/admin/team', {
      body: { name: 'Kafui Support', email: 'kafui@equipe.test', role: 'support' },
    });
    const id = created.body.member.id as string;
    const session = (await login(
      t.db,
      { email: 'kafui@equipe.test', password: created.body.temporaryPassword },
      { ip: '3.3.3.3', userAgent: null },
    )) as { token: string };
    // Mot de passe provisoire : seul le changement de mot de passe est permis ; le tableau de bord répond 403, pas 401.
    expect(
      (await call(dashboardRoute, 'GET', '/v1/admin/dashboard', { token: session.token })).status,
    ).toBe(403);

    const off = await send(memberRoute, 'PATCH', `/v1/admin/team/${id}`, {
      id,
      body: { status: 'disabled' },
    });
    expect(off.body.find((m: { id: string }) => m.id === id).status).toBe('disabled');
    expect(
      (await call(dashboardRoute, 'GET', '/v1/admin/dashboard', { token: session.token })).status,
    ).toBe(401);
    await expect(
      login(
        t.db,
        { email: 'kafui@equipe.test', password: created.body.temporaryPassword },
        { ip: '3.3.3.4', userAgent: null },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    await send(memberRoute, 'PATCH', `/v1/admin/team/${id}`, { id, body: { status: 'active' } });
    const reset = await send(resetPasswordRoute, 'POST', `/v1/admin/team/${id}/reset-password`, {
      id,
    });
    expect(reset.body.temporaryPassword).not.toBe(created.body.temporaryPassword);
    await expect(
      login(
        t.db,
        { email: 'kafui@equipe.test', password: created.body.temporaryPassword },
        { ip: '3.3.3.5', userAgent: null },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    await t.db
      .update(s.adminUsers)
      .set({ failedAttempts: 5, lockedUntil: new Date(Date.now() + 600_000) })
      .where(eq(s.adminUsers.id, id));
    expect(
      (await send(teamRoute, 'GET', '/v1/admin/team')).body.find((m: { id: string }) => m.id === id)
        .lockedUntil,
    ).not.toBeNull();
    const unlocked = await send(unlockRoute, 'POST', `/v1/admin/team/${id}/unlock`, { id });
    expect(unlocked.body.find((m: { id: string }) => m.id === id).lockedUntil).toBeNull();
  });

  it('jamais soi-même, jamais le dernier administrateur actif', async () => {
    const self = await send(memberRoute, 'PATCH', '/v1/admin/team/adm_admin', {
      id: 'adm_admin',
      body: { role: 'readonly' },
    });
    expect(self.status).toBe(422);

    // Seul administrateur actif : même un autre compte ne peut pas lui retirer ses droits.
    const [support] = await t.db
      .select()
      .from(s.adminUsers)
      .where(eq(s.adminUsers.id, 'adm_support'));
    await expect(
      updateMember(
        t.db,
        { admin: support!, sessionId: 'x' },
        'adm_admin',
        { role: 'orders' },
        null,
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/au moins un administrateur actif/) });

    // Avec un second administrateur actif, c'est permis.
    const other = await send(newMemberRoute, 'POST', '/v1/admin/team', {
      body: { name: 'Edem Admin', email: 'edem@equipe.test', role: 'admin' },
    });
    const otherId = other.body.member.id as string;
    const demoted = await send(memberRoute, 'PATCH', `/v1/admin/team/${otherId}`, {
      id: otherId,
      body: { role: 'orders' },
    });
    expect(demoted.body.find((m: { id: string }) => m.id === otherId).role).toBe('orders');
  });
});
