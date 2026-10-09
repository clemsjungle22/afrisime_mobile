import {
  type Carnet,
  type CarnetList,
  type CarnetStatus,
  type ContributeBody,
  type Contribution,
  type ContributionMethod,
  type ContributionStatus,
  MAX_ACTIVE_CARNETS,
  CARNET_DEADLINE_FACTOR,
  type Order,
  type Pack,
  type PackList,
  type PackItemView,
  type PaymentAction,
  type ProductDetail,
  type RedeemBody,
  type Slot,
  deliverySlots,
  pickupSlots,
  validateCart,
  carnetProgress,
  contributionError,
  dailyAmountOf,
  catalogValue,
  packItemsView,
} from '@afrisime/shared';
import { and, asc, count, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { getCatalog } from '../catalog/service';
import { loadAgencies, loadRules, loadZone, slotOccupancy } from '../checkout/rules';
import { listAddresses } from '../customers/addresses';
import { addStoreCredit } from '../customers/storeCredit';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { once } from '../idempotency';
import { createPackOrder, getOrder } from '../orders/service';
import { type ProviderPayment, type ProviderStatus, paymentProvider } from '../payments/provider';

/**
 * Packs Famille et carnets : le client cotise (Mobile Money ou espèces en agence) jusqu'à l'échéance,
 * puis reçoit les produits. Contenu et prix sont figés à la souscription.
 */

type Customer = { id: string };
type CarnetRow = typeof s.carnets.$inferSelect;
type ContributionRow = typeof s.carnetContributions.$inferSelect;
type PackRow = typeof s.packs.$inferSelect;
type PackLine = { variantId: string; quantity: number };
export type ContributionWithAgency = ContributionRow & { agencyName: string | null };
export type CarnetSnapshot = { name: string; imageUrl: string | null; items: PackItemView[] };

const DAY_MS = 86_400_000;
/** Durée laissée au client pour confirmer sur son téléphone (comme pour une commande). */
const PAYMENT_TTL_MS = 90_000;
const notFound = () => new ApiError('NOT_FOUND', 'Carnet introuvable.');
const invalid = (message: string) => new ApiError('VALIDATION_ERROR', message, undefined, 422);

/** Événement pour AfriGes (même transaction que le changement). */
const publish = (tx: Db, eventType: string, carnetId: string, payload: Record<string, unknown>) =>
  tx.insert(s.outbox).values({ eventType, aggregate: 'carnet', aggregateId: carnetId, payload });

// ─── Packs ───────────────────────────────────────────────────────────────────

export function toPack(row: PackRow, products: ProductDetail[]): Pack {
  const items = row.items as PackLine[];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    items: packItemsView(items, products),
    price: row.price,
    durationDays: row.durationDays,
    dailyAmount: dailyAmountOf(row.price, row.durationDays),
    catalogValue: catalogValue(items, products),
  };
}

export async function listPacks(db: Db): Promise<PackList> {
  const [rows, catalog] = await Promise.all([
    db.select().from(s.packs).where(eq(s.packs.isActive, true)).orderBy(asc(s.packs.sortOrder)),
    getCatalog('retail'),
  ]);
  return { items: rows.map((r) => toPack(r, catalog.products)) };
}

// ─── Lecture des carnets ─────────────────────────────────────────────────────

export function toContribution(c: ContributionRow, agencyName: string | null): Contribution {
  return {
    id: c.id,
    amount: c.amount,
    method: c.method as ContributionMethod,
    status: c.status as ContributionStatus,
    createdAt: c.createdAt.toISOString(),
    settledAt: c.settledAt?.toISOString() ?? null,
    agencyName,
    failureReason: c.failureReason,
    action:
      c.status === 'pending'
        ? ((c.providerData as { action?: PaymentAction } | null)?.action ?? null)
        : null,
  };
}

/** Délai maximum : début + durée × CARNET_DEADLINE_FACTOR. */
export const deadlineOf = (row: Pick<CarnetRow, 'startedAt' | 'durationDays'>) =>
  new Date(row.startedAt.getTime() + row.durationDays * CARNET_DEADLINE_FACTOR * DAY_MS);

export function toCarnet(row: CarnetRow, contributions: Contribution[], now: Date): Carnet {
  const snapshot = row.snapshot as CarnetSnapshot;
  const status = row.status as CarnetStatus;
  const progress = carnetProgress(
    {
      price: row.price,
      dailyAmount: row.dailyAmount,
      paid: row.paid,
      startedAt: row.startedAt,
      status,
    },
    now,
  );
  return {
    id: row.id,
    packId: row.packId,
    name: snapshot.name,
    imageUrl: snapshot.imageUrl,
    items: snapshot.items,
    price: row.price,
    durationDays: row.durationDays,
    dailyAmount: row.dailyAmount,
    paid: row.paid,
    remaining: progress.remaining,
    status,
    startedAt: row.startedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    deadlineAt: deadlineOf(row).toISOString(),
    orderId: row.orderId,
    creditedAmount: row.creditedAmount,
    expectedToDate: progress.expectedToDate,
    daysLate: progress.daysLate,
    pendingContribution: contributions.find((c) => c.status === 'pending') ?? null,
    contributions,
  };
}

/** Cotisations de plusieurs carnets, avec le nom de l'agence pour les espèces. */
export async function contributionsOf(
  db: Db,
  carnetIds: string[],
): Promise<Map<string, ContributionWithAgency[]>> {
  if (carnetIds.length === 0) return new Map();
  const rows = await db
    .select({ c: s.carnetContributions, agencyName: s.agencies.name })
    .from(s.carnetContributions)
    .leftJoin(s.agencies, eq(s.agencies.id, s.carnetContributions.agencyId))
    .where(inArray(s.carnetContributions.carnetId, carnetIds))
    .orderBy(desc(s.carnetContributions.createdAt));
  const map = new Map<string, ContributionWithAgency[]>();
  for (const { c, agencyName } of rows)
    map.set(c.carnetId, [...(map.get(c.carnetId) ?? []), { ...c, agencyName }]);
  return map;
}

async function present(db: Db, rows: CarnetRow[], now: Date): Promise<Carnet[]> {
  const byCarnet = await contributionsOf(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) =>
    toCarnet(
      r,
      (byCarnet.get(r.id) ?? []).map((c) => toContribution(c, c.agencyName)),
      now,
    ),
  );
}

/** Rattrapage : demande l'issue des cotisations Mobile Money encore en attente. */
async function refreshPending(db: Db, carnetIds: string[], now: Date) {
  if (carnetIds.length === 0) return;
  const pending = await db
    .select()
    .from(s.carnetContributions)
    .where(
      and(
        inArray(s.carnetContributions.carnetId, carnetIds),
        eq(s.carnetContributions.status, 'pending'),
      ),
    );
  for (const c of pending) await refreshContribution(db, c, now);
}

async function ownCarnet(db: Db, customerId: string, carnetId: string): Promise<CarnetRow> {
  const [row] = await db
    .select()
    .from(s.carnets)
    .where(and(eq(s.carnets.id, carnetId), eq(s.carnets.customerId, customerId)));
  if (!row) throw notFound();
  return row;
}

const STATUS_ORDER: Record<string, number> = {
  active: 0,
  completed: 1,
  delivered: 2,
  abandoned: 3,
};

export async function listCarnets(
  db: Db,
  customer: Customer,
  now = new Date(),
): Promise<CarnetList> {
  const ids = (
    await db
      .select({ id: s.carnets.id })
      .from(s.carnets)
      .where(eq(s.carnets.customerId, customer.id))
  ).map((r) => r.id);
  await refreshPending(db, ids, now);
  await closeOverdueCarnets(db, now, customer.id);
  const rows = await db
    .select()
    .from(s.carnets)
    .where(eq(s.carnets.customerId, customer.id))
    .orderBy(desc(s.carnets.startedAt));
  rows.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  // Abandonné sans aucun versement : plus rien à suivre, il n'encombre pas la liste.
  const visible = rows.filter((r) => !(r.status === 'abandoned' && r.paid === 0));
  return { items: await present(db, visible, now) };
}

export async function getCarnet(db: Db, customer: Customer, carnetId: string, now = new Date()) {
  await ownCarnet(db, customer.id, carnetId);
  await refreshPending(db, [carnetId], now);
  await closeOverdueCarnets(db, now, customer.id);
  const [carnet] = await present(db, [await ownCarnet(db, customer.id, carnetId)], now);
  return carnet!;
}

// ─── Souscription ────────────────────────────────────────────────────────────

/** Souscrire à un pack : contenu, prix et durée figés ce jour-là. */
export async function subscribe(
  db: Db,
  customer: Customer,
  packId: string,
  key: string,
  now = new Date(),
): Promise<Carnet> {
  // Catalogue lu AVANT la transaction (jamais de seconde connexion pendant qu'elle est ouverte).
  const catalog = await getCatalog('retail');
  return once(
    db,
    { customerId: customer.id, key, route: 'POST /v1/me/carnets', body: { packId } },
    async (tx) => {
      const [pack] = await tx
        .select()
        .from(s.packs)
        .where(and(eq(s.packs.id, packId), eq(s.packs.isActive, true)));
      if (!pack) throw new ApiError('NOT_FOUND', 'Ce pack n’est plus proposé.');
      const [active] = await tx
        .select({ n: count() })
        .from(s.carnets)
        .where(and(eq(s.carnets.customerId, customer.id), eq(s.carnets.status, 'active')));
      if ((active?.n ?? 0) >= MAX_ACTIVE_CARNETS)
        throw invalid(
          `${MAX_ACTIVE_CARNETS} carnets en cours au maximum : terminez-en un avant d’en ouvrir un autre.`,
        );

      const snapshot: CarnetSnapshot = {
        name: pack.name,
        imageUrl: pack.imageUrl,
        items: packItemsView(pack.items as PackLine[], catalog.products),
      };
      const id = newId('car');
      await tx.insert(s.carnets).values({
        id,
        customerId: customer.id,
        packId: pack.id,
        snapshot,
        price: pack.price,
        durationDays: pack.durationDays,
        dailyAmount: dailyAmountOf(pack.price, pack.durationDays),
        startedAt: now,
        dueAt: new Date(now.getTime() + pack.durationDays * DAY_MS),
        createdAt: now,
        updatedAt: now,
      });
      await publish(tx, 'carnet.subscribed', id, {
        customerId: customer.id,
        packId: pack.id,
        price: pack.price,
      });
      return id;
    },
    (id) => getCarnet(db, customer, id, now),
  );
}

// ─── Cotisations ─────────────────────────────────────────────────────────────

function toProviderPayment(c: ContributionRow): ProviderPayment {
  return {
    id: c.id,
    method: c.method as 'mixx' | 'flooz',
    amount: c.amount,
    phone: c.phone ?? '',
    createdAt: c.createdAt,
    expiresAt: c.expiresAt ?? c.createdAt,
    providerReference: c.providerReference,
    providerData: (c.providerData as { provider?: unknown } | null)?.provider ?? null,
  };
}

/**
 * Enregistre l'issue d'une cotisation UNE seule fois ; réussie, elle s'ajoute au carnet,
 * qui passe « soldé » quand le prix est atteint.
 */
export async function settleContribution(
  db: Db,
  contributionId: string,
  status: Exclude<ProviderStatus, 'pending'>,
  failureReason: string | null,
  at = new Date(),
): Promise<boolean> {
  return db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const [c] = await tx
      .update(s.carnetContributions)
      .set({ status, failureReason, settledAt: at })
      .where(
        and(
          eq(s.carnetContributions.id, contributionId),
          eq(s.carnetContributions.status, 'pending'),
        ),
      )
      .returning();
    if (!c) return false;
    if (status === 'succeeded') await credit(tx, c, at);
    return true;
  });
}

/** Ajoute une cotisation réussie au carnet (dans la transaction de l'appelant). */
export async function credit(tx: Db, c: ContributionRow, at: Date) {
  const [carnet] = await tx
    .update(s.carnets)
    .set({ paid: sql`${s.carnets.paid} + ${c.amount}`, updatedAt: at })
    .where(eq(s.carnets.id, c.carnetId))
    .returning();
  if (!carnet) return;
  await publish(tx, 'carnet.contribution_received', carnet.id, {
    contributionId: c.id,
    amount: c.amount,
    method: c.method,
  });
  if (carnet.status === 'active' && carnet.paid >= carnet.price) {
    await tx
      .update(s.carnets)
      .set({ status: 'completed', completedAt: at, updatedAt: at })
      .where(and(eq(s.carnets.id, carnet.id), eq(s.carnets.status, 'active')));
    await publish(tx, 'carnet.completed', carnet.id, { paid: carnet.paid });
  }
}

async function refreshContribution(db: Db, c: ContributionRow, now: Date) {
  if (c.status !== 'pending' || !c.provider) return;
  const result = await paymentProvider(c.provider).fetchStatus(toProviderPayment(c), now);
  if (result.status !== 'pending')
    await settleContribution(db, c.id, result.status, result.failureReason, now);
}

/** Webhook d'un prestataire pour une cotisation (référence inconnue des commandes). */
export async function settleContributionByReference(
  db: Db,
  provider: string,
  reference: string,
  status: Exclude<ProviderStatus, 'pending'>,
  failureReason: string | null,
): Promise<boolean> {
  const [c] = await db
    .select({ id: s.carnetContributions.id })
    .from(s.carnetContributions)
    .where(
      and(
        eq(s.carnetContributions.provider, provider),
        eq(s.carnetContributions.providerReference, reference),
      ),
    );
  if (!c) return false;
  await settleContribution(db, c.id, status, failureReason);
  return true;
}

/** Tâche périodique : cotisations encore en attente depuis au moins `olderThanMs`. */
export async function refreshPendingContributions(db: Db, now: Date, olderThanMs = 10_000) {
  const rows = await db
    .select()
    .from(s.carnetContributions)
    .where(
      and(
        eq(s.carnetContributions.status, 'pending'),
        lte(s.carnetContributions.createdAt, new Date(now.getTime() - olderThanMs)),
      ),
    );
  for (const c of rows) await refreshContribution(db, c, now);
  return rows.length;
}

/**
 * Cotiser par Mobile Money. Jamais deux demandes en cours pour un même carnet : une demande encore
 * active est renvoyée telle quelle (double appui, reconnexion).
 */
export async function contribute(
  db: Db,
  customer: Customer,
  carnetId: string,
  body: ContributeBody,
  key: string,
  now = new Date(),
): Promise<Carnet> {
  await ownCarnet(db, customer.id, carnetId);
  await refreshPending(db, [carnetId], now);
  return once(
    db,
    {
      customerId: customer.id,
      key,
      route: 'POST /v1/me/carnets/contributions',
      body: { carnetId, ...body },
    },
    async (tx) => {
      const [carnet] = await tx.select().from(s.carnets).where(eq(s.carnets.id, carnetId));
      if (!carnet || carnet.status !== 'active')
        throw invalid('Ce carnet n’accepte plus de cotisation.');
      const [active] = await tx
        .select({ id: s.carnetContributions.id })
        .from(s.carnetContributions)
        .where(
          and(
            eq(s.carnetContributions.carnetId, carnetId),
            eq(s.carnetContributions.status, 'pending'),
          ),
        );
      if (active) return carnetId;
      const error = contributionError(body.amount, carnet.price - carnet.paid);
      if (error) throw invalid(error);

      const provider = paymentProvider();
      const id = newId('cot');
      const draft: ProviderPayment = {
        id,
        method: body.method,
        amount: body.amount,
        phone: body.phone,
        createdAt: now,
        expiresAt: new Date(now.getTime() + PAYMENT_TTL_MS),
        providerReference: null,
        providerData: null,
      };
      // Appel au prestataire dans la transaction : si la demande échoue, rien n'est enregistré.
      const started = await provider.initiate(draft);
      await tx.insert(s.carnetContributions).values({
        id,
        carnetId,
        method: body.method,
        amount: body.amount,
        status: 'pending',
        provider: provider.name,
        providerReference: started.reference,
        providerData: { provider: started.data, action: started.action },
        phone: body.phone,
        expiresAt: draft.expiresAt,
        createdAt: now,
      });
      return carnetId;
    },
    (id) => getCarnet(db, customer, id, now),
  );
}

// ─── Fin du carnet : abandon, délai dépassé, remise ──────────────────────────

/**
 * Clôt un carnet en cours (abandon ou délai dépassé) : les sommes versées deviennent un avoir.
 * Sans effet si le carnet n'est plus en cours (rejouable).
 */
async function closeCarnet(
  tx: Db,
  carnetId: string,
  reason: 'carnet_abandoned' | 'carnet_expired',
  at: Date,
): Promise<boolean> {
  const [closed] = await tx
    .update(s.carnets)
    .set({ status: 'abandoned', creditedAmount: sql`${s.carnets.paid}`, updatedAt: at })
    .where(and(eq(s.carnets.id, carnetId), eq(s.carnets.status, 'active')))
    .returning();
  if (!closed) return false;
  await addStoreCredit(tx, {
    customerId: closed.customerId,
    amount: closed.paid,
    reason,
    carnetId: closed.id,
    note: `${(closed.snapshot as CarnetSnapshot).name} : ${reason === 'carnet_abandoned' ? 'carnet abandonné' : 'délai dépassé'}`,
    at,
  });
  await publish(
    tx,
    reason === 'carnet_abandoned' ? 'carnet.abandoned' : 'carnet.expired',
    closed.id,
    {
      credited: closed.paid,
    },
  );
  return true;
}

/** Carnets en cours dont le délai maximum est dépassé : clos, versements transformés en avoir. */
export async function closeOverdueCarnets(db: Db, now: Date, customerId?: string): Promise<number> {
  const overdue = await db
    .select({ id: s.carnets.id })
    .from(s.carnets)
    .where(
      and(
        eq(s.carnets.status, 'active'),
        customerId ? eq(s.carnets.customerId, customerId) : undefined,
        sql`${s.carnets.startedAt} + (${s.carnets.durationDays} * ${CARNET_DEADLINE_FACTOR}) * interval '1 day' < ${now}`,
      ),
    );
  let closed = 0;
  for (const c of overdue) {
    await refreshPending(db, [c.id], now);
    if (
      await db.transaction((txn) => closeCarnet(txn as unknown as Db, c.id, 'carnet_expired', now))
    )
      closed++;
  }
  return closed;
}

/** Abandon par le client : les sommes versées deviennent un avoir. */
export async function abandonCarnet(
  db: Db,
  customer: Customer,
  carnetId: string,
  now = new Date(),
) {
  await ownCarnet(db, customer.id, carnetId);
  await refreshPending(db, [carnetId], now);
  const [pending] = await db
    .select({ id: s.carnetContributions.id })
    .from(s.carnetContributions)
    .where(
      and(
        eq(s.carnetContributions.carnetId, carnetId),
        eq(s.carnetContributions.status, 'pending'),
      ),
    );
  if (pending)
    throw invalid('Une cotisation est en attente de confirmation : réessayez dans un instant.');
  const done = await db.transaction((txn) =>
    closeCarnet(txn as unknown as Db, carnetId, 'carnet_abandoned', now),
  );
  if (!done) throw invalid('Ce carnet n’est plus en cours.');
  return getCarnet(db, customer, carnetId, now);
}

/**
 * Recevoir le pack soldé : commande déjà payée (contenu figé, au prix du pack), retrait en agence ou
 * livraison (frais de zone payés au livreur), créneau au choix. Une seule commande par carnet.
 */
export async function redeemCarnet(
  db: Db,
  customer: Customer,
  carnetId: string,
  body: RedeemBody,
  key: string,
  now = new Date(),
): Promise<Order> {
  await ownCarnet(db, customer.id, carnetId);
  const catalog = await getCatalog('retail');
  return once(
    db,
    {
      customerId: customer.id,
      key,
      route: 'POST /v1/me/carnets/redeem',
      body: { carnetId, ...body },
    },
    async (tx) => {
      const [carnet] = await tx
        .select()
        .from(s.carnets)
        .where(and(eq(s.carnets.id, carnetId), eq(s.carnets.customerId, customer.id)));
      if (!carnet) throw notFound();
      if (carnet.status !== 'completed') {
        throw invalid(
          carnet.status === 'delivered'
            ? 'Ce pack a déjà été commandé.'
            : 'Ce carnet n’est pas encore soldé.',
        );
      }

      const rules = await loadRules(tx);
      const isFull = await slotOccupancy(tx, rules, now);
      let slots: Slot[];
      let summary: string;
      let fee = 0;
      if (body.fulfillment === 'delivery') {
        const address = (await listAddresses(tx, customer.id)).find((a) => a.id === body.addressId);
        if (!address) throw invalid('Adresse introuvable.');
        const zone = await loadZone(tx, address.zoneId);
        if (!zone)
          throw new ApiError(
            'ZONE_NOT_SERVED',
            'Nous ne livrons pas encore ce quartier. Choisissez le retrait en agence.',
            undefined,
            422,
          );
        slots = deliverySlots(zone.id, now, rules, isFull);
        summary = `Livraison · ${address.label} — ${address.district}`;
        fee = carnet.price >= rules.freeAbove ? 0 : zone.fee;
      } else {
        const agency = (await loadAgencies(tx)).find((a) => a.id === body.agencyId);
        if (!agency) throw invalid('Agence introuvable.');
        slots = pickupSlots(agency.id, now, rules, isFull);
        summary = `Retrait · Agence ${agency.name}`;
      }
      const slot = slots.find((x) => x.id === body.slotId);
      if (!slot || !slot.available) {
        throw new ApiError(
          'SLOT_UNAVAILABLE',
          "Ce créneau n'est plus disponible. Choisissez-en un autre.",
          undefined,
          409,
        );
      }

      // Produits du pack au stock du moment (le contenu, lui, est figé depuis la souscription).
      const snapshot = carnet.snapshot as CarnetSnapshot;
      const validated = validateCart(
        {
          lines: snapshot.items.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            expectedUnitPrice: null,
            expectedAvailability: 'available' as const,
          })),
        },
        { products: catalog.products, stock: catalog.stockLimits },
      );
      const missing = [
        ...validated.changes.filter((c) => c.type === 'removed').map((c) => c.productName),
        ...validated.lines
          .filter((l) => l.quantity < l.requestedQuantity)
          .map((l) => l.productName),
      ];
      if (missing.length > 0) {
        throw new ApiError(
          'OUT_OF_STOCK',
          'Un produit de votre pack est momentanément indisponible. Contactez votre agence AfriSime : l’équipe trouve une solution avec vous.',
          { products: missing },
          409,
        );
      }

      // Prix du pack réparti sur les produits (au prorata de leur valeur du jour) ; total = prix du pack.
      const values = validated.lines.map((l) => (l.unitPrice ?? 0) * l.quantity);
      const totalValue = values.reduce((n, v) => n + v, 0);
      let allocated = 0;
      const lines = validated.lines.map((l, i) => {
        const last = i === validated.lines.length - 1;
        const share = last
          ? carnet.price - allocated
          : totalValue > 0
            ? Math.round((carnet.price * values[i]!) / totalValue)
            : 0;
        allocated += share;
        return {
          ...l,
          unitPrice: Math.round(share / l.quantity),
          lineTotal: share,
          status: 'ok' as const,
        };
      });

      const orderId = await createPackOrder(tx, {
        customerId: customer.id,
        packName: snapshot.name,
        lines,
        fulfillment: body.fulfillment,
        addressId: body.fulfillment === 'delivery' ? body.addressId : null,
        agencyId: body.fulfillment === 'pickup' ? body.agencyId : null,
        summary,
        slot,
        deliveryFee: fee,
        now,
      });
      await tx
        .update(s.carnets)
        .set({ status: 'delivered', orderId, updatedAt: now })
        .where(eq(s.carnets.id, carnet.id));
      await publish(tx, 'carnet.redeemed', carnet.id, { orderId, fulfillment: body.fulfillment });
      return orderId;
    },
    (orderId) => getOrder(db, customer.id, orderId, now),
  );
}
