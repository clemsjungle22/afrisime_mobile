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
import { decodeCursor, encodeCursor } from '../catalog/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { log } from '../log';
import { once } from '../idempotency';
import { emit } from '../outbox';
import { paymentProvider } from '../payments/provider';
import { refreshPayment } from '../payments/service';
import { AWAITING_PAYMENT, CANCELLABLE, IN_PROGRESS, PAYMENT_DEADLINE_MS, closeReservations, refreshOrder, reserveStock, transition } from './state';

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
    cancellable: CANCELLABLE.has(row.status),
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

      const lines = q.lines.filter((l) => l.quantity > 0);
      const modes = await tx
        .select({ id: s.productVariants.id, saleMode: s.productVariants.saleMode })
        .from(s.productVariants)
        .where(inArray(s.productVariants.id, lines.map((l) => l.variantId)));
      const standard = new Set(modes.filter((m) => m.saleMode === 'standard').map((m) => m.id));

      const id = newId('ord');
      const online = ONLINE_PAYMENT_METHODS.has(q.paymentMethod);
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
        paymentStatus: online ? 'initiated' : 'pending',
        itemCount: lines.reduce((n, l) => n + l.quantity, 0),
        subtotal: q.subtotal,
        deliveryFee: q.deliveryFee,
        discountTotal: q.discountTotal,
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
      const note = online
        ? 'En attente du paiement'
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

// ─── Annulation, recommande ──────────────────────────────────────────────────

export async function cancelOrder(db: Db, customerId: string, orderId: string, reason: string | null, now = new Date()): Promise<Order> {
  await getOrder(db, customerId, orderId, now); // applique d'abord délai et avancement
  const row = await ownOrder(db, customerId, orderId);
  if (!CANCELLABLE.has(row.status)) {
    throw new ApiError('ORDER_NOT_CANCELLABLE', 'Cette commande est déjà en préparation : elle ne peut plus être annulée.');
  }
  const paid = row.paymentStatus === 'succeeded';

  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const note = reason ? `Annulée à votre demande : ${reason}` : 'Annulée à votre demande';
    const done = await transition(tx, orderId, [...CANCELLABLE], 'cancelled', note, now, {}, 'customer');
    if (!done) throw new ApiError('ORDER_NOT_CANCELLABLE', 'Cette commande ne peut plus être annulée.');
    await closeReservations(tx, orderId, 'release', now);
    await emit(tx, 'order.cancelled', orderId, { reason: 'customer' });
    if (paid) {
      await transition(tx, orderId, ['cancelled'], 'refunded', 'Remboursement Mobile Money sous 48 h', now, { paymentStatus: 'refunded' });
      if (row.currentPaymentId) {
        await tx.update(s.payments).set({ status: 'refunded', updatedAt: now }).where(eq(s.payments.id, row.currentPaymentId));
      }
      await emit(tx, 'order.refunded', orderId, { amount: row.total });
    }
  });
  // Remboursement demandé au prestataire APRÈS l'enregistrement de l'annulation :
  // en cas d'échec, la commande reste « remboursée » côté client et l'incident est signalé au back-office.
  if (paid && row.currentPaymentId) {
    const [payment] = await db.select().from(s.payments).where(eq(s.payments.id, row.currentPaymentId));
    if (payment && (payment.method === 'mixx' || payment.method === 'flooz')) {
      await paymentProvider(payment.provider)
        .refund({
          id: payment.id,
          method: payment.method,
          amount: payment.amount,
          phone: payment.phone ?? '',
          createdAt: payment.createdAt,
          expiresAt: payment.expiresAt,
          providerReference: payment.providerReference,
          providerData: payment.providerData,
        })
        .catch((error: unknown) => log.error('remboursement en échec : à traiter manuellement', { orderId, error }));
    }
  }
  return getOrder(db, customerId, orderId, now);
}

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
