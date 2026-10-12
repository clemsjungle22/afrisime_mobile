import {
  FINAL_ORDER_STATUSES,
  ONLINE_PAYMENT_METHODS,
  type Order,
  type OrderList,
  type OrderStatus,
  type Quote,
  type ReorderResponse,
  type Slot,
  type ValidatedCartLine,
} from '@afrisime/shared';
import { randomInt } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { validate } from '../cart/service';
import { createDebt } from '../credit/service';
import { assertKycAllows } from '../kyc/service';
import { addStoreCredit, lockStoreCredit, storeCreditBalance } from '../customers/storeCredit';
import { loadRules, slotOccupancy } from '../checkout/rules';
import { decodeCursor, encodeCursor } from '../catalog/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { once } from '../idempotency';
import { emit } from '../outbox';
import { refreshPayment } from '../payments/service';
import { AWAITING_PAYMENT, IN_PROGRESS, PAYMENT_DEADLINE_MS, refreshOrder, reserveStock } from './state';

type Customer = { id: string; segment: string };
const PAGE = 20;
const FINAL = [...FINAL_ORDER_STATUSES];

const notFound = () => new ApiError('NOT_FOUND', 'Commande introuvable.');
const quoteExpired = (message = "Ce devis n'est plus valable. Vérifiez votre commande.") =>
  new ApiError('QUOTE_EXPIRED', message);

/** Code de retrait à 6 chiffres. */
const pickupCode = () => String(randomInt(100_000, 1_000_000));

async function nextOrderNumber(tx: Db, now: Date): Promise<string> {
  const res = (await tx.execute(sql`select nextval('order_number_seq')::text as n`)) as unknown as
    | { rows: { n: string }[] }
    | { n: string }[];
  const rows = Array.isArray(res) ? res : res.rows;
  return `AFS-${now.getUTCFullYear()}-${String(rows[0]!.n).padStart(6, '0')}`;
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

async function toOrder(db: Db, row: typeof s.orders.$inferSelect): Promise<Order> {
  const [lines, events] = await Promise.all([
    db.select({ snapshot: s.orderLines.snapshot }).from(s.orderLines).where(eq(s.orderLines.orderId, row.id)).orderBy(asc(s.orderLines.sortOrder)),
    db
      .select()
      .from(s.orderStatusEvents)
      .where(eq(s.orderStatusEvents.orderId, row.id))
      .orderBy(asc(s.orderStatusEvents.at), asc(s.orderStatusEvents.id)),
  ]);
  return {
    ...summaryOf(row),
    lines: lines.map((l) => l.snapshot as ValidatedCartLine),
    subtotal: row.subtotal,
    deliveryFee: row.deliveryFee,
    discountTotal: row.discountTotal,
    deliveryBonus: row.deliveryBonus,
    storeCreditUsed: row.storeCreditUsed,
    currency: 'XOF',
    addressId: row.addressId,
    agencyId: row.agencyId,
    pickupCode: row.pickupCode,
    payment: {
      method: row.paymentMethod,
      status: row.paymentStatus,
      paymentId: row.currentPaymentId,
      paidAt: row.paidAt?.toISOString() ?? null,
    },
    history: events.map((e) => ({ status: e.status, at: e.at.toISOString(), note: e.note })),
    // Le client n'annule plus lui-même : il passe par son agence (annulation par l'équipe).
    cancellable: false,
    paymentDeadline: AWAITING_PAYMENT.includes(row.status) ? (row.paymentDeadline?.toISOString() ?? null) : null,
  };
}

function summaryOf(row: typeof s.orders.$inferSelect) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    total: row.total,
    itemCount: row.itemCount,
    fulfillment: row.fulfillment,
    fulfillmentSummary: row.fulfillmentSummary,
    slot: row.slot as Slot,
    payable: AWAITING_PAYMENT.includes(row.status) && ONLINE_PAYMENT_METHODS.has(row.paymentMethod),
  };
}

async function ownOrder(db: Db, customerId: string, orderId: string) {
  const [row] = await db
    .select()
    .from(s.orders)
    .where(and(eq(s.orders.id, orderId), eq(s.orders.customerId, customerId)));
  if (!row) throw notFound();
  return row;
}

/** Détail d'une commande « à jour » : paiement en cours revérifié, délai et avancement appliqués. */
export async function getOrder(db: Db, customerId: string, orderId: string, now = new Date()): Promise<Order> {
  const row = await ownOrder(db, customerId, orderId);
  if (row.currentPaymentId && row.paymentStatus === 'pending') await refreshPayment(db, row.currentPaymentId, now);
  await refreshOrder(db, orderId, now);
  return toOrder(db, await ownOrder(db, customerId, orderId));
}

export async function listOrders(
  db: Db,
  customerId: string,
  filter: 'active' | 'history',
  cursor: string | undefined,
  now = new Date(),
): Promise<OrderList> {
  // Les commandes ouvertes sont d'abord mises à jour (délai de paiement, avancement).
  const open = await db
    .select({ id: s.orders.id, paymentId: s.orders.currentPaymentId, paymentStatus: s.orders.paymentStatus })
    .from(s.orders)
    .where(and(eq(s.orders.customerId, customerId), notInArray(s.orders.status, FINAL)));
  for (const o of open) {
    if (o.paymentId && o.paymentStatus === 'pending') await refreshPayment(db, o.paymentId, now);
    await refreshOrder(db, o.id, now);
  }

  const start = decodeCursor(cursor);
  const rows = await db
    .select()
    .from(s.orders)
    .where(
      and(
        eq(s.orders.customerId, customerId),
        filter === 'history' ? inArray(s.orders.status, FINAL) : notInArray(s.orders.status, FINAL),
      ),
    )
    .orderBy(desc(s.orders.createdAt), desc(s.orders.id))
    .limit(PAGE + 1)
    .offset(start);
  return {
    items: rows.slice(0, PAGE).map(summaryOf),
    nextCursor: rows.length > PAGE ? encodeCursor(start + PAGE) : null,
  };
}

// ─── Création ────────────────────────────────────────────────────────────────

/**
 * Commande passée sur un devis valide (une seule fois), avec réservation du stock dans la même transaction.
 * Mobile Money : en attente de paiement (30 min) ; à la livraison / en agence : confirmée tout de suite.
 */
export async function createOrder(db: Db, customer: Customer, quoteId: string, key: string, now = new Date()): Promise<Order> {
  return once(
    db,
    { customerId: customer.id, key, route: 'POST /v1/orders', body: { quoteId } },
    async (tx) => {
      const consumed = await tx
        .update(s.quotes)
        .set({ consumedAt: now })
        .where(and(eq(s.quotes.id, quoteId), eq(s.quotes.customerId, customer.id), isNull(s.quotes.consumedAt)))
        .returning();
      const quoteRow = consumed[0];
      if (!quoteRow) throw quoteExpired();
      if (quoteRow.expiresAt <= now) throw quoteExpired('Les prix garantis ont expiré. Vérifiez votre commande.');
      const q = quoteRow.payload as Quote;

      // Capacité du créneau revérifiée au moment de commander (un devis ne réserve pas de place).
      // Verrou par créneau : deux commandes simultanées ne peuvent pas prendre la dernière place.
      const rules = await loadRules(tx);
      const capacity = rules.slots?.capacity;
      if (capacity && (capacity.delivery !== null || capacity.pickup !== null)) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${q.slot.id}))`);
        const isFull = await slotOccupancy(tx, rules, now);
        const kind = q.fulfillment === 'delivery' ? 'd_' : 'p_';
        if (isFull({ id: q.slot.id, kind, dayIndex: 0, fromHour: 0 })) {
          throw new ApiError(
            'SLOT_UNAVAILABLE',
            'Ce créneau vient d’être complet. Choisissez-en un autre.',
            undefined,
            409,
          );
        }
      }

      // Identité : achats au-delà du seuil sur 30 jours sans vérification refusés.
      await assertKycAllows(tx, customer.id, q.total, rules.kycThreshold ?? 0, now);

      // Avoir : revérifié sous verrou (deux commandes ne dépensent jamais le même avoir).
      const credit = q.storeCreditApplied ?? 0;
      if (credit > 0) {
        await lockStoreCredit(tx, customer.id);
        if ((await storeCreditBalance(tx, customer.id)) < credit) {
          throw quoteExpired('Votre avoir a changé. Vérifiez votre commande.');
        }
      }

      const lines = q.lines.filter((l) => l.quantity > 0);
      const modes = await tx
        .select({ id: s.productVariants.id, saleMode: s.productVariants.saleMode })
        .from(s.productVariants)
        .where(inArray(s.productVariants.id, lines.map((l) => l.variantId)));
      const standard = new Set(modes.filter((m) => m.saleMode === 'standard').map((m) => m.id));

      const id = newId('ord');
      // Entièrement réglée par l'avoir : rien à payer, confirmée tout de suite.
      const settled = q.total === 0;
      const online = ONLINE_PAYMENT_METHODS.has(q.paymentMethod) && !settled;
      const status: OrderStatus = online ? 'pending_payment' : 'confirmed';
      await tx.insert(s.orders).values({
        id,
        orderNumber: await nextOrderNumber(tx, now),
        customerId: customer.id,
        status,
        fulfillment: q.fulfillment,
        addressId: q.addressId,
        agencyId: q.agencyId,
        fulfillmentSummary: q.fulfillmentSummary,
        slot: q.slot,
        paymentMethod: q.paymentMethod,
        paymentStatus: settled ? 'succeeded' : online ? 'initiated' : 'pending',
        paidAt: settled ? now : null,
        itemCount: lines.reduce((n, l) => n + l.quantity, 0),
        subtotal: q.subtotal,
        deliveryFee: q.deliveryFee,
        discountTotal: q.discountTotal,
        deliveryBonus: q.deliveryBonus ?? 0,
        storeCreditUsed: credit,
        total: q.total,
        pickupCode: q.fulfillment === 'pickup' ? pickupCode() : null,
        paymentDeadline: online ? new Date(now.getTime() + PAYMENT_DEADLINE_MS) : null,
        quoteId: q.quoteId,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(s.orderLines).values(
        q.lines.map((l, i) => ({
          orderId: id,
          variantId: l.variantId,
          productSlug: l.productSlug,
          productName: l.productName,
          brand: l.brand,
          variantLabel: l.variantLabel,
          color: l.color,
          unitPrice: l.unitPrice ?? 0,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
          snapshot: l,
          sortOrder: i,
        })),
      );
      if (credit > 0) {
        await addStoreCredit(tx, { customerId: customer.id, amount: -credit, reason: 'order', orderId: id, at: now });
      }
      // À crédit : plafond et retard revérifiés sous verrou, puis la dette est créée.
      if (q.paymentMethod === 'credit' && !settled) {
        await createDebt(tx, { customerId: customer.id, orderId: id, amount: q.total, now });
      }
      const note = settled
        ? 'Réglée avec votre avoir'
        : online
        ? 'En attente du paiement'
        : q.paymentMethod === 'credit'
          ? 'Payée à crédit : à rembourser chaque jour'
          : q.paymentMethod === 'cash_on_delivery'
          ? 'Paiement à la livraison'
          : 'Paiement au retrait en agence';
      await tx.insert(s.orderStatusEvents).values({ orderId: id, status, note, at: now, actor: 'customer' });
      // Les formats « sur commande » ne puisent pas dans le stock.
      await reserveStock(
        tx,
        id,
        lines.filter((l) => standard.has(l.variantId)).map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        q.agencyId,
      );
      await emit(tx, 'order.created', id, { customerId: customer.id, total: q.total, paymentMethod: q.paymentMethod });
      return id;
    },
    (id) => getOrder(db, customer.id, id, now),
  );
}

// ─── Commande d'un Pack Famille soldé ────────────────────────────────────────

/**
 * Commande de remise d'un pack déjà payé par le carnet (dans la transaction de l'appelant) :
 * produits au prix du pack (déduit en « payé par carnet »), seuls les frais de livraison restent dus,
 * en espèces au livreur. Stock réservé comme pour toute commande.
 */
export async function createPackOrder(
  tx: Db,
  input: {
    customerId: string;
    packName: string;
    lines: ValidatedCartLine[];
    fulfillment: 'delivery' | 'pickup';
    addressId: string | null;
    agencyId: string | null;
    summary: string;
    slot: Slot;
    deliveryFee: number;
    now: Date;
  },
): Promise<string> {
  const { now } = input;
  const subtotal = input.lines.reduce((n, l) => n + l.lineTotal, 0);
  const total = input.deliveryFee;
  const paymentMethod = input.fulfillment === 'delivery' ? 'cash_on_delivery' : 'pay_at_agency';
  const quoteId = newId('qte');
  await tx.insert(s.quotes).values({
    id: quoteId,
    customerId: input.customerId,
    payload: { pack: input.packName, lines: input.lines, subtotal, deliveryFee: input.deliveryFee, total },
    total,
    expiresAt: now,
    consumedAt: now,
    createdAt: now,
  });
  const id = newId('ord');
  await tx.insert(s.orders).values({
    id,
    orderNumber: await nextOrderNumber(tx, now),
    customerId: input.customerId,
    status: 'confirmed',
    fulfillment: input.fulfillment,
    addressId: input.addressId,
    agencyId: input.agencyId,
    fulfillmentSummary: input.summary,
    slot: input.slot,
    paymentMethod,
    paymentStatus: total === 0 ? 'succeeded' : 'pending',
    paidAt: total === 0 ? now : null,
    itemCount: input.lines.reduce((n, l) => n + l.quantity, 0),
    subtotal,
    deliveryFee: input.deliveryFee,
    discountTotal: subtotal,
    total,
    pickupCode: input.fulfillment === 'pickup' ? pickupCode() : null,
    paymentDeadline: null,
    quoteId,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(s.orderLines).values(
    input.lines.map((l, i) => ({
      orderId: id,
      variantId: l.variantId,
      productSlug: l.productSlug,
      productName: l.productName,
      brand: l.brand,
      variantLabel: l.variantLabel,
      color: l.color,
      unitPrice: l.unitPrice ?? 0,
      quantity: l.quantity,
      lineTotal: l.lineTotal,
      snapshot: l,
      sortOrder: i,
    })),
  );
  const note =
    total > 0
      ? `${input.packName} réglé par votre carnet · frais de livraison à régler au livreur`
      : `${input.packName} réglé par votre carnet`;
  await tx.insert(s.orderStatusEvents).values({ orderId: id, status: 'confirmed', note, at: now, actor: 'customer' });
  const modes = await tx
    .select({ id: s.productVariants.id, saleMode: s.productVariants.saleMode })
    .from(s.productVariants)
    .where(inArray(s.productVariants.id, input.lines.map((l) => l.variantId)));
  const standard = new Set(modes.filter((m) => m.saleMode === 'standard').map((m) => m.id));
  await reserveStock(
    tx,
    id,
    input.lines.filter((l) => standard.has(l.variantId)).map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    input.agencyId,
  );
  await emit(tx, 'order.created', id, { customerId: input.customerId, total, paymentMethod, pack: input.packName });
  return id;
}

// ─── Annulation, recommande ──────────────────────────────────────────────────

/** Articles d'une ancienne commande, revalidés au prix et au stock du jour. */
export async function reorder(db: Db, customer: Customer, orderId: string): Promise<ReorderResponse> {
  const order = await toOrder(db, await ownOrder(db, customer.id, orderId));
  const validated = await validate(
    {
      lines: order.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.requestedQuantity,
        expectedUnitPrice: l.unitPrice,
        expectedAvailability: 'available',
      })),
    },
    customer.segment,
  );
  return { lines: validated.lines };
}

/** Pour les tâches planifiées. */
export { AWAITING_PAYMENT, IN_PROGRESS };
