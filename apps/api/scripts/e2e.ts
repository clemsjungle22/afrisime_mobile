import './load-env';
import { randomInt, randomUUID } from 'node:crypto';
import {
  AdminLoginResponse,
  AdminOrderDetail,
  AdminOrderList,
  Address,
  AuthTokens,
  DeliveryOptions,
  Order,
  OrderList,
  OtpRequestResponse,
  OtpVerifyResponse,
  PaymentIntent,
  ProductListResponse,
  Quote,
  ReorderResponse,
  ServerCart,
  UserProfile,
  ValidatedCart,
} from '@afrisime/shared';
import { eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { hashPassword } from '../src/server/admin/crypto';
import { createPostgresDb } from '../src/server/db/client';
import * as s from '../src/server/db/schema';

/**
 * Test de bout en bout : rejoue par le réseau le parcours de l'app sur un serveur qui tourne
 * (mêmes en-têtes que l'app : jeton, Idempotency-Key, renouvellement de session).
 * Prérequis : `npm run api` lancé avec OTP_DEV_CODE défini dans .env.local.
 * Un numéro de test neuf est utilisé à chaque fois ; tout ce qui a été créé est effacé à la fin.
 *
 * Couvre aussi le back-office : un membre de l'équipe temporaire traite la commande jusqu'à « livrée ».
 *
 *   npm run e2e                         (serveur local, port 4000)
 *   API_URL=http://10.0.0.5:4000 npm run e2e
 */
const BASE = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');
const CODE = process.env.OTP_DEV_CODE;
const PHONE = `+22879${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
const DEVICE = { platform: 'android', model: 'e2e', osVersion: null, appVersion: 'e2e' } as const;
/** Membre de l'équipe temporaire (rôle Commandes), supprimé à la fin. */
const STAFF = {
  id: `adm_e2e_${PHONE.slice(-6)}`,
  email: `e2e-${PHONE.slice(-6)}@afrisime.local`,
  password: `e2e-${randomUUID()}`,
};

let token = '';
const started = performance.now();
const elapsed = () => `${((performance.now() - started) / 1000).toFixed(1)} s`.padStart(7);

async function api<S extends z.ZodType>(
  method: string,
  path: string,
  schema: S | null,
  options: { body?: unknown; key?: string; expect?: number; auth?: boolean } = {},
): Promise<z.infer<S>> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.auth !== false && token) headers.authorization = `Bearer ${token}`;
  if (options.key) headers['idempotency-key'] = options.key;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  const expected = options.expect ?? (res.ok ? res.status : 200);
  if (res.status !== expected) {
    throw new Error(
      `${method} ${path} → ${res.status} (attendu ${expected}) ${text.slice(0, 300)}`,
    );
  }
  if (!schema) return json as z.infer<S>;
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new Error(
      `${method} ${path} : réponse hors contrat ${parsed.error.message.slice(0, 300)}`,
    );
  return parsed.data;
}

function step(label: string, detail = '') {
  console.log(`${elapsed()}  ✔ ${label}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!CODE)
    throw new Error(
      'OTP_DEV_CODE doit être défini dans apps/api/.env.local (et le serveur redémarré).',
    );
  console.log(`Test de bout en bout sur ${BASE} avec le numéro ${PHONE}\n`);

  await api('GET', '/health', null);
  step('Serveur et base joignables');

  const otp = await api('POST', '/v1/auth/otp/request', OtpRequestResponse, {
    body: { phone: PHONE },
  });
  const login = await api('POST', '/v1/auth/otp/verify', OtpVerifyResponse, {
    body: { requestId: otp.requestId, code: CODE, device: DEVICE },
  });
  token = login.accessToken;
  let refreshToken = login.refreshToken;
  step('Connexion par code', login.isNewUser ? 'nouveau compte' : 'compte existant');

  const me = await api('PATCH', '/v1/me', UserProfile, {
    body: {
      firstName: 'Test',
      lastName: 'Bout-en-bout',
      customerTypeId: 'particulier',
      agencyId: 'agc_lome_centre',
      consents: { marketing: false, termsVersion: '2026-10' },
    },
  });
  if (!me.profileComplete) throw new Error('profil incomplet');
  step('Profil complété');

  const address = await api('POST', '/v1/me/addresses', Address, {
    expect: 201,
    body: {
      label: 'Maison',
      recipientName: 'Test E2E',
      phone: PHONE,
      district: 'Tokoin',
      city: 'Lomé',
      landmark: 'Derrière la pharmacie',
      instructions: null,
      location: null,
      isDefault: true,
    },
  });
  step('Adresse ajoutée', `${address.zoneName}`);

  const products = await api('GET', '/v1/products?q=riz', ProductListResponse);
  const riz = products.items.find(
    (p) => p.defaultVariant.price !== null && p.defaultVariant.availability === 'available',
  );
  if (!riz) throw new Error('aucun riz disponible');
  const variant = riz.defaultVariant;
  step(
    'Catalogue',
    `${products.total} résultat(s) pour « riz », ${riz.name} ${variant.label} à ${variant.price} F`,
  );

  const lines = [{ variantId: variant.id, quantity: 2 }];
  await api('PUT', '/v1/cart', ServerCart, { body: { lines } });
  const cart = await api('GET', '/v1/cart', ServerCart);
  if (cart.lines[0]?.quantity !== 2) throw new Error('panier non enregistré');
  const expected = lines.map((l) => ({
    ...l,
    expectedUnitPrice: variant.price,
    expectedAvailability: 'available' as const,
  }));
  const validated = await api('POST', '/v1/cart/validate', ValidatedCart, {
    body: { lines: expected },
  });
  step(
    'Panier enregistré et revérifié',
    `${validated.total} F, ${validated.changes.length} changement(s)`,
  );

  const options = await api('GET', `/v1/delivery/options?addressId=${address.id}`, DeliveryOptions);
  const slot = options.delivery?.slots.find((x) => x.available);
  if (!slot) throw new Error('aucun créneau de livraison');
  step('Options de livraison', `frais ${options.delivery!.fee} F, créneau ${slot.start}`);

  const quote = await api('POST', '/v1/checkout/quote', Quote, {
    body: {
      fulfillment: 'delivery',
      addressId: address.id,
      agencyId: null,
      slotId: slot.id,
      paymentMethod: 'mixx',
      useCredit: false,
      lines: expected,
    },
  });
  step('Devis', `${quote.total} F garantis jusqu'à ${quote.expiresAt}`);

  const orderKey = randomUUID();
  const order = await api('POST', '/v1/orders', Order, {
    expect: 201,
    key: orderKey,
    body: { quoteId: quote.quoteId },
  });
  const replay = await api('POST', '/v1/orders', Order, {
    expect: 201,
    key: orderKey,
    body: { quoteId: quote.quoteId },
  });
  if (replay.id !== order.id) throw new Error('double commande avec la même Idempotency-Key');
  step(
    'Commande',
    `${order.orderNumber}, ${order.status} (renvoi de la même demande : même commande)`,
  );

  const payKey = randomUUID();
  const pay = await api('POST', '/v1/payments', PaymentIntent, {
    expect: 201,
    key: payKey,
    body: { orderId: order.id, method: 'mixx', phone: '+22890000001' },
  });
  let status = pay.status;
  for (let i = 0; i < 15 && status === 'pending'; i++) {
    await sleep(1000);
    status = (await api('GET', `/v1/payments/${pay.id}`, PaymentIntent)).status;
  }
  if (status !== 'succeeded') throw new Error(`paiement ${status}`);
  step('Paiement Mixx by Yas (simulé)', 'confirmé');

  const paid = await api('GET', `/v1/orders/${order.id}`, Order);
  if (paid.status !== 'confirmed') throw new Error(`commande ${paid.status} au lieu de confirmed`);
  step('Suivi', paid.history.map((h) => h.note).join(' → '));

  // ─── Traitement par l'équipe, via les adresses du back-office ───
  let customerToken = token;
  const { db, close } = createPostgresDb(process.env.DATABASE_URL!, { max: 1 });
  try {
    await db.insert(s.adminUsers).values({
      id: STAFF.id,
      email: STAFF.email,
      name: 'Équipe e2e',
      role: 'orders',
      passwordHash: await hashPassword(STAFF.password),
      mustChangePassword: false,
    });
  } finally {
    await close();
  }
  const staff = await api('POST', '/v1/admin/auth/login', AdminLoginResponse, {
    auth: false,
    body: { email: STAFF.email, password: STAFF.password },
  });
  if (staff.status !== 'authenticated') throw new Error(`connexion équipe : ${staff.status}`);
  token = staff.token;
  const queue = await api(
    'GET',
    `/v1/admin/orders?tab=to_prepare&q=${order.orderNumber}`,
    AdminOrderList,
  );
  if (!queue.items.some((o) => o.id === order.id))
    throw new Error('commande absente de « À préparer »');
  const move = (action: string, expectedStatus: string, note?: string) =>
    api('POST', `/v1/admin/orders/${order.id}/transition`, AdminOrderDetail, {
      body: { action, expectedStatus, note },
    });
  await move('start_preparing', 'confirmed');
  await move('dispatch', 'preparing', 'Livreur : test e2e');
  const delivered = await move('mark_delivered', 'out_for_delivery');
  step(
    'Traitée par l’équipe (back-office)',
    delivered.history.map((h) => `${h.status} (${h.actor})`).join(' → '),
  );

  token = customerToken;
  const seen = await api('GET', `/v1/orders/${order.id}`, Order);
  if (
    seen.status !== 'delivered' ||
    !seen.history.some((h) => h.note?.includes('Livreur : test e2e'))
  ) {
    throw new Error(`le client ne voit pas la livraison : ${seen.status}`);
  }
  step('Le client voit sa commande livrée', seen.history.map((h) => h.note).join(' → '));

  const renewed = await api('POST', '/v1/auth/refresh', AuthTokens, {
    auth: false,
    body: { refreshToken },
  });
  token = renewed.accessToken;
  refreshToken = renewed.refreshToken;
  const history = await api('GET', '/v1/orders?status=history', OrderList);
  if (!history.items.some((o) => o.id === order.id))
    throw new Error('commande absente de l’historique');
  step('Session renouvelée', 'historique des commandes avec le nouveau jeton');

  // Seconde commande, payée à la livraison, annulée par l'équipe avec un motif.
  const quote2 = await api('POST', '/v1/checkout/quote', Quote, {
    body: {
      fulfillment: 'delivery',
      addressId: address.id,
      agencyId: null,
      slotId: slot.id,
      paymentMethod: 'cash_on_delivery',
      useCredit: false,
      lines: expected,
    },
  });
  const order2 = await api('POST', '/v1/orders', Order, {
    expect: 201,
    key: randomUUID(),
    body: { quoteId: quote2.quoteId },
  });
  token = staff.token;
  await api('POST', `/v1/admin/orders/${order2.id}/cancel`, AdminOrderDetail, {
    body: { expectedStatus: order2.status, reason: 'test e2e' },
  });
  token = customerToken = renewed.accessToken;
  const cancelled = await api('GET', `/v1/orders/${order2.id}`, Order);
  if (cancelled.status !== 'cancelled') throw new Error(`annulation : ${cancelled.status}`);
  step('Annulation par l’équipe', cancelled.history.at(-1)?.note ?? '');

  const again = await api('POST', `/v1/orders/${order.id}/reorder`, ReorderResponse);
  step('Recommande', `${again.lines.length} article(s) remis dans le panier`);

  await api('POST', '/v1/auth/logout', null, { expect: 204 });
  await api('GET', '/v1/me', null, { expect: 401 });
  step('Déconnexion', 'le jeton est refusé ensuite');
}

/** Efface tout ce que le test a créé (le compte de test et ce qui en dépend). */
async function cleanup() {
  if (!process.env.DATABASE_URL) return;
  const { db, close } = createPostgresDb(process.env.DATABASE_URL, { max: 1 });
  try {
    const [customer] = await db
      .select({ id: s.customers.id })
      .from(s.customers)
      .where(eq(s.customers.phone, PHONE));
    if (customer) {
      const orders = await db
        .select({ id: s.orders.id })
        .from(s.orders)
        .where(eq(s.orders.customerId, customer.id));
      const ids = orders.map((o) => o.id);
      if (ids.length) {
        await db.delete(s.payments).where(inArray(s.payments.orderId, ids));
        await db.delete(s.outbox).where(inArray(s.outbox.aggregateId, ids));
        await db.delete(s.auditLog).where(inArray(s.auditLog.entityId, ids));
        await db.delete(s.orders).where(inArray(s.orders.id, ids));
      }
      await db.delete(s.quotes).where(eq(s.quotes.customerId, customer.id));
      await db.delete(s.idempotencyKeys).where(eq(s.idempotencyKeys.customerId, customer.id));
      await db.delete(s.auditLog).where(eq(s.auditLog.entityId, customer.id));
      await db.delete(s.customers).where(eq(s.customers.id, customer.id));
    }
    await db.delete(s.otpRequests).where(eq(s.otpRequests.phone, PHONE));
    await db.delete(s.auditLog).where(eq(s.auditLog.entityId, STAFF.id));
    await db.delete(s.adminUsers).where(eq(s.adminUsers.id, STAFF.id));
    console.log(`${elapsed()}  ✔ Données de test effacées`);
  } finally {
    await close();
  }
}

main()
  .then(() => console.log('\nParcours complet réussi.'))
  .catch((error: unknown) => {
    console.error(`\n✘ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => cleanup().catch((e: unknown) => console.error('Nettoyage incomplet :', e)));
