import { DELIVERY_RULES, mockOnboardingOptions, mockProducts, mockStock, mockZones, packSeeds } from '@afrisime/fixtures';
import {
  Carnet,
  CarnetList,
  type Contribution,
  CARNET_DEADLINE_FACTOR,
  MAX_ACTIVE_CARNETS,
  Order,
  type Quote,
  type RedeemBody,
  deliverySlots,
  pickupSlots,
  validateCart,
  PackList,
  carnetProgress,
  catalogValue,
  contributionError,
  dailyAmountOf,
  packItemsView,
} from '@afrisime/shared';
import type { CarnetsApi } from '@/features/carnets/api';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { type MockCarnet, type MockContribution, type MockDb, loadDb, saveDb } from './db';
import { userAddresses } from './checkout';
import { PAYMENT_CONFIRM_MS, PAYMENT_FAIL_MS, createOrder, getOrder, registerQuote } from './orderServer';
import { addCredit } from './storeCredit';
import { mockError, simulate } from './simulate';

/** Packs et carnets du mode démo : mêmes règles et mêmes délais de paiement simulé que le serveur. */

const DAY_MS = 86_400_000;
const PAYMENT_TTL_MS = 90_000;
const read = <T>(run: () => Promise<T>, signal?: AbortSignal) => withRetry(run, { canRetry: true, signal });

const HINTS = {
  mixx: 'Validez la demande Mixx by Yas reçue sur votre téléphone avec votre code secret.',
  flooz: 'Validez la demande Flooz reçue sur votre téléphone avec votre code secret.',
} as const;
const FAILURE = {
  failed: 'Solde insuffisant ou paiement refusé. Vérifiez votre compte puis réessayez.',
  expired: 'Délai de confirmation dépassé.',
} as const;

const packs = () =>
  packSeeds.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: null,
    items: packItemsView(p.items, mockProducts),
    price: p.price,
    durationDays: p.durationDays,
    dailyAmount: dailyAmountOf(p.price, p.durationDays),
    catalogValue: catalogValue(p.items, mockProducts),
  }));

/** Issue simulée d'une cotisation Mobile Money encore en attente (figée une fois atteinte). */
function settle(carnet: MockCarnet, now: number): boolean {
  let changed = false;
  for (const c of carnet.contributions) {
    if (c.status !== 'pending') continue;
    const elapsed = now - Date.parse(c.createdAt);
    const next =
      c.outcome === 'succeed' && elapsed >= PAYMENT_CONFIRM_MS
        ? 'succeeded'
        : c.outcome === 'fail' && elapsed >= PAYMENT_FAIL_MS
          ? 'failed'
          : now >= Date.parse(c.expiresAt ?? c.createdAt)
            ? 'expired'
            : null;
    if (!next) continue;
    c.status = next;
    c.settledAt = new Date(now).toISOString();
    c.failureReason = next === 'succeeded' ? null : FAILURE[next];
    if (next === 'succeeded') carnet.paid += c.amount;
    changed = true;
  }
  if (carnet.status === 'active' && carnet.paid >= carnet.price) {
    carnet.status = 'completed';
    carnet.completedAt = new Date(now).toISOString();
    changed = true;
  }
  return changed;
}

function toContribution(c: MockContribution): Contribution {
  return {
    id: c.id,
    amount: c.amount,
    method: c.method,
    status: c.status,
    createdAt: c.createdAt,
    settledAt: c.settledAt,
    agencyName: null,
    failureReason: c.failureReason,
    action:
      c.status === 'pending' && c.method !== 'cash'
        ? { type: 'confirm_on_phone', url: null, instructions: HINTS[c.method] }
        : null,
  };
}

function toCarnet(c: MockCarnet, now: number): Carnet {
  const progress = carnetProgress({ ...c, startedAt: new Date(c.startedAt) }, new Date(now));
  const contributions = [...c.contributions].reverse().map(toContribution);
  return {
    id: c.id,
    packId: c.packId,
    name: c.name,
    imageUrl: null,
    items: c.items,
    price: c.price,
    durationDays: c.durationDays,
    dailyAmount: c.dailyAmount,
    paid: c.paid,
    remaining: progress.remaining,
    status: c.status,
    startedAt: c.startedAt,
    dueAt: c.dueAt,
    completedAt: c.completedAt,
    deadlineAt: new Date(Date.parse(c.startedAt) + c.durationDays * CARNET_DEADLINE_FACTOR * DAY_MS).toISOString(),
    orderId: c.orderId ?? null,
    creditedAmount: c.creditedAmount ?? 0,
    expectedToDate: progress.expectedToDate,
    daysLate: progress.daysLate,
    pendingContribution: contributions.find((x) => x.status === 'pending') ?? null,
    contributions,
  };
}

/** Clôt un carnet en cours : les sommes versées deviennent un avoir. */
function close(db: MockDb, userId: string, c: MockCarnet, reason: 'carnet_abandoned' | 'carnet_expired', now: number) {
  c.status = 'abandoned';
  c.creditedAmount = c.paid;
  addCredit(db, userId, {
    amount: c.paid,
    reason,
    carnetId: c.id,
    label: `${c.name} : ${reason === 'carnet_abandoned' ? 'carnet abandonné' : 'délai dépassé'}`,
    at: now,
  });
}

/** Carnets du client connecté, cotisations en attente réglées, délais dépassés clos ; `run` peut les modifier. */
async function withCarnets<T>(token: string | null, run: (carnets: MockCarnet[], now: number, db: MockDb, userId: string) => T) {
  const user = await requireUser(token);
  const db = await loadDb();
  const carnets = db.carnets[user.id] ?? [];
  const now = Date.now();
  carnets.forEach((c) => settle(c, now));
  for (const c of carnets) {
    const deadline = Date.parse(c.startedAt) + c.durationDays * CARNET_DEADLINE_FACTOR * DAY_MS;
    if (c.status === 'active' && now > deadline && !c.contributions.some((x) => x.status === 'pending')) {
      close(db, user.id, c, 'carnet_expired', now);
    }
  }
  const result = run(carnets, now, db, user.id);
  await saveDb({ ...db, carnets: { ...db.carnets, [user.id]: carnets } });
  return result;
}

/** Réponses déjà données par clé d'idempotence (rejouer la même clé = même résultat). */
const replies = new Map<string, string>();

export const mockCarnetsApi: CarnetsApi = {
  listPacks(signal) {
    return read(() => simulate(PackList, () => ({ items: packs() })), signal);
  },
  listCarnets(signal) {
    return read(
      () =>
        withAuth((token) =>
          simulate(CarnetList, () =>
            withCarnets(token, (carnets, now) => ({
              items: [...carnets]
                .filter((c) => !(c.status === 'abandoned' && c.paid === 0))
                .sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active') || b.startedAt.localeCompare(a.startedAt))
                .map((c) => toCarnet(c, now)),
            })),
          ),
        ),
      signal,
    );
  },
  getCarnet(carnetId, signal) {
    return read(
      () =>
        withAuth((token) =>
          simulate(Carnet, () =>
            withCarnets(token, (carnets, now) => {
              const c = carnets.find((x) => x.id === carnetId);
              if (!c) throw mockError('NOT_FOUND', 'Carnet introuvable.', 404);
              return toCarnet(c, now);
            }),
          ),
        ),
      signal,
    );
  },
  subscribe(packId, key) {
    return read(() =>
      withAuth((token) =>
        simulate(Carnet, () =>
          withCarnets(token, (carnets, now) => {
            const done = replies.get(key);
            const existing = done ? carnets.find((c) => c.id === done) : undefined;
            if (existing) return toCarnet(existing, now);
            const pack = packs().find((p) => p.id === packId);
            if (!pack) throw mockError('NOT_FOUND', 'Ce pack n’est plus proposé.', 404);
            if (carnets.filter((c) => c.status === 'active').length >= MAX_ACTIVE_CARNETS) {
              throw mockError('VALIDATION_ERROR', `${MAX_ACTIVE_CARNETS} carnets en cours au maximum : terminez-en un avant d’en ouvrir un autre.`, 422);
            }
            const carnet: MockCarnet = {
              id: `car_${now.toString(36)}`,
              packId: pack.id,
              name: pack.name,
              items: pack.items,
              price: pack.price,
              durationDays: pack.durationDays,
              dailyAmount: pack.dailyAmount,
              paid: 0,
              status: 'active',
              startedAt: new Date(now).toISOString(),
              dueAt: new Date(now + pack.durationDays * DAY_MS).toISOString(),
              completedAt: null,
              contributions: [],
            };
            carnets.push(carnet);
            replies.set(key, carnet.id);
            return toCarnet(carnet, now);
          }),
        ),
      ),
    );
  },
  contribute(carnetId, body, key) {
    return read(() =>
      withAuth((token) =>
        simulate(Carnet, () =>
          withCarnets(token, (carnets, now) => {
            const carnet = carnets.find((c) => c.id === carnetId);
            if (!carnet) throw mockError('NOT_FOUND', 'Carnet introuvable.', 404);
            if (replies.has(key) || carnet.contributions.some((c) => c.status === 'pending')) return toCarnet(carnet, now);
            if (carnet.status !== 'active') throw mockError('VALIDATION_ERROR', 'Ce carnet n’accepte plus de cotisation.', 422);
            const error = contributionError(body.amount, carnet.price - carnet.paid);
            if (error) throw mockError('VALIDATION_ERROR', error, 422);
            carnet.contributions.push({
              id: `cot_${now.toString(36)}`,
              amount: body.amount,
              method: body.method,
              status: 'pending',
              outcome: body.phone.endsWith('0002') ? 'fail' : body.phone.endsWith('0003') ? 'expire' : 'succeed',
              createdAt: new Date(now).toISOString(),
              expiresAt: new Date(now + PAYMENT_TTL_MS).toISOString(),
              settledAt: null,
              failureReason: null,
            });
            replies.set(key, carnet.id);
            return toCarnet(carnet, now);
          }),
        ),
      ),
    );
  },
  abandon(carnetId) {
    return withRetry(
      () =>
        withAuth((token) =>
          simulate(Carnet, () =>
            withCarnets(token, (carnets, now, db, userId) => {
              const c = carnets.find((x) => x.id === carnetId);
              if (!c) throw mockError('NOT_FOUND', 'Carnet introuvable.', 404);
              if (c.contributions.some((x) => x.status === 'pending')) {
                throw mockError('VALIDATION_ERROR', 'Une cotisation est en attente de confirmation : réessayez dans un instant.', 422);
              }
              if (c.status !== 'active') throw mockError('VALIDATION_ERROR', 'Ce carnet n’est plus en cours.', 422);
              close(db, userId, c, 'carnet_abandoned', now);
              return toCarnet(c, now);
            }),
          ),
        ),
      { canRetry: false },
    );
  },
  redeem(carnetId, body, key) {
    return read(() => withAuth((token) => simulate(Order, () => redeemMock(token, carnetId, body, key))));
  },
};

/** Remise du pack soldé : commande déjà payée (frais de livraison au livreur), comme le serveur. */
async function redeemMock(token: string | null, carnetId: string, body: RedeemBody, key: string) {
  const user = await requireUser(token);
  const db = await loadDb();
  const carnet = (db.carnets[user.id] ?? []).find((c) => c.id === carnetId);
  if (!carnet) throw mockError('NOT_FOUND', 'Carnet introuvable.', 404);
  const done = replies.get(key);
  if (done) return getOrder(user.id, done);
  if (carnet.status !== 'completed') {
    throw mockError('VALIDATION_ERROR', carnet.status === 'delivered' ? 'Ce pack a déjà été commandé.' : 'Ce carnet n’est pas encore soldé.', 422);
  }
  const now = new Date();
  let fee = 0;
  let summary: string;
  let slots;
  if (body.fulfillment === 'delivery') {
    const address = (await userAddresses(user.id)).find((a) => a.id === body.addressId);
    const zone = address?.zoneId ? mockZones.find((z) => z.id === address.zoneId) : undefined;
    if (!address || !zone) throw mockError('ZONE_NOT_SERVED', 'Nous ne livrons pas encore ce quartier. Choisissez le retrait en agence.', 422);
    slots = deliverySlots(zone.id, now, DELIVERY_RULES);
    summary = `Livraison · ${address.label} — ${address.district}`;
    fee = carnet.price >= DELIVERY_RULES.freeAbove ? 0 : zone.fee;
  } else {
    const agency = mockOnboardingOptions.agencies.find((a) => a.id === body.agencyId);
    if (!agency) throw mockError('VALIDATION_ERROR', 'Agence introuvable.', 422);
    slots = pickupSlots(agency.id, now, DELIVERY_RULES);
    summary = `Retrait · Agence ${agency.name}`;
  }
  const slot = slots.find((x) => x.id === body.slotId);
  if (!slot || !slot.available) throw mockError('SLOT_UNAVAILABLE', "Ce créneau n'est plus disponible. Choisissez-en un autre.", 409);

  const validated = validateCart(
    { lines: carnet.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, expectedUnitPrice: null, expectedAvailability: 'available' as const })) },
    { products: mockProducts, stock: mockStock },
  );
  if (validated.changes.some((c) => c.type === 'removed') || validated.lines.some((l) => l.quantity < l.requestedQuantity)) {
    throw mockError('OUT_OF_STOCK', 'Un produit de votre pack est momentanément indisponible. Contactez votre agence AfriSime : l’équipe trouve une solution avec vous.', 409);
  }
  const values = validated.lines.map((l) => (l.unitPrice ?? 0) * l.quantity);
  const totalValue = values.reduce((n, v) => n + v, 0);
  let allocated = 0;
  const lines = validated.lines.map((l, i) => {
    const share = i === validated.lines.length - 1 ? carnet.price - allocated : totalValue > 0 ? Math.round((carnet.price * values[i]!) / totalValue) : 0;
    allocated += share;
    return { ...l, unitPrice: Math.round(share / l.quantity), lineTotal: share, status: 'ok' as const };
  });
  const quote: Quote = {
    quoteId: `qte_pack_${Date.now().toString(36)}`,
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    fulfillment: body.fulfillment,
    addressId: body.fulfillment === 'delivery' ? body.addressId : null,
    agencyId: body.fulfillment === 'pickup' ? body.agencyId : null,
    slot,
    paymentMethod: body.fulfillment === 'delivery' ? 'cash_on_delivery' : 'pay_at_agency',
    lines,
    subtotal: carnet.price,
    deliveryFee: fee,
    discountTotal: carnet.price,
    deliveryBonus: 0,
    storeCreditApplied: 0,
    total: fee,
    currency: 'XOF',
    fulfillmentSummary: summary,
  };
  registerQuote(user.id, quote);
  const order = await createOrder(user.id, { quoteId: quote.quoteId }, key);
  const fresh = await loadDb();
  const stored = (fresh.carnets[user.id] ?? []).find((c) => c.id === carnetId);
  if (stored) {
    stored.status = 'delivered';
    stored.orderId = order.id;
  }
  await saveDb({ ...fresh });
  replies.set(key, order.id);
  return order;
}
