import {
  ADMIN_ORDER_TABS,
  type AdminCancelBody,
  type AdminCollectBody,
  type AdminOrderAction,
  type AdminOrderDetail,
  type AdminOrderList,
  type AdminOrderListQuery,
  type AdminOrderRow,
  type AdminOrderTab,
  type AdminRole,
  type AdminTransitionAction,
  type AdminTransitionBody,
  FINAL_ORDER_STATUSES,
  type OrderStatus,
  PAYMENT_LABELS,
  type Slot,
  type ValidatedCartLine,
} from '@afrisime/shared';
import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { safeEqual } from '../auth/tokens';
import { decodeCursor, encodeCursor } from '../catalog/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { log } from '../log';
import { AWAITING_PAYMENT, closeReservations, refreshOrder, transition } from '../orders/state';
import { emit } from '../outbox';
import { paymentProvider } from '../payments/provider';
import { type AdminContext, adminAudit } from './auth';

const PAGE = 50;
const SEGMENT_LABELS: Record<string, string> = { retail: 'Particulier', pro: 'Professionnel' };
/** Paiement remis en main propre (livreur ou agence) : l'équipe l'encaisse. */
const PAID_ON_HANDOVER = new Set(['cash_on_delivery', 'pay_at_agency']);
const OPEN: OrderStatus[] = [
  'pending_payment',
  'payment_failed',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
];

/** Rôles qui traitent les commandes ; le service client peut seulement ajouter des notes. */
export const ORDER_VIEW_ROLES: readonly AdminRole[] = ['admin', 'orders', 'support', 'readonly'];
export const ORDER_ACT_ROLES: readonly AdminRole[] = ['admin', 'orders'];
export const ORDER_NOTE_ROLES: readonly AdminRole[] = ['admin', 'orders', 'support'];

type OrderRow = typeof s.orders.$inferSelect;

type Step = {
  from: readonly OrderStatus[];
  to: OrderStatus;
  fulfillment?: 'delivery' | 'pickup';
  /** Note par défaut, visible par le client. */
  note: string;
  final?: boolean;
};

/** Étapes que l'équipe peut faire franchir (le serveur refuse tout le reste). */
const STEPS: Record<AdminTransitionAction, Step> = {
  start_preparing: {
    from: ['confirmed'],
    to: 'preparing',
    note: 'Votre commande est en préparation',
  },
  mark_ready: {
    from: ['preparing'],
    to: 'ready_for_pickup',
    fulfillment: 'pickup',
    note: 'Prête : présentez votre code en agence',
  },
  dispatch: {
    from: ['preparing'],
    to: 'out_for_delivery',
    fulfillment: 'delivery',
    note: 'Le livreur est en route',
  },
  delivery_failed: {
    from: ['out_for_delivery'],
    to: 'preparing',
    fulfillment: 'delivery',
    note: 'Livraison reportée',
  },
  mark_delivered: {
    from: ['out_for_delivery'],
    to: 'delivered',
    fulfillment: 'delivery',
    note: 'Livrée',
    final: true,
  },
  complete_pickup: {
    from: ['ready_for_pickup'],
    to: 'completed',
    fulfillment: 'pickup',
    note: 'Retirée en agence',
    final: true,
  },
};

/** Montant à encaisser à la remise (paiement à la livraison ou en agence non encore reçu). */
function amountDue(
  o: Pick<OrderRow, 'paymentMethod' | 'paymentStatus' | 'status' | 'total'>,
): number {
  if (!PAID_ON_HANDOVER.has(o.paymentMethod) || o.paymentStatus === 'succeeded') return 0;
  return FINAL_ORDER_STATUSES.has(o.status) ? 0 : o.total;
}

function allowedActions(o: OrderRow, role: AdminRole): AdminOrderAction[] {
  const actions: AdminOrderAction[] = [];
  if (ORDER_ACT_ROLES.includes(role)) {
    for (const [action, step] of Object.entries(STEPS) as [AdminTransitionAction, Step][]) {
      if (step.from.includes(o.status) && (!step.fulfillment || step.fulfillment === o.fulfillment))
        actions.push(action);
    }
    if (amountDue(o) > 0 && !AWAITING_PAYMENT.includes(o.status)) actions.push('collect_payment');
    if (OPEN.includes(o.status)) actions.push('cancel');
  }
  if (ORDER_NOTE_ROLES.includes(role)) actions.push('add_note');
  return actions;
}

const customerName = (c: { firstName: string | null; lastName: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(' ') || null;

const changed = (current: OrderStatus) =>
  new ApiError(
    'ORDER_CHANGED',
    "Cette commande vient d'être modifiée par quelqu'un d'autre. Rechargez la page.",
    {
      currentStatus: current,
    },
  );

// ─── Liste ───────────────────────────────────────────────────────────────────

/** Recherche : numéro de commande, téléphone (même partiel) ou nom du client. */
function searchCondition(q: string): SQL | undefined {
  const digits = q.replace(/\D/g, '');
  const parts: (SQL | undefined)[] = [ilike(s.orders.orderNumber, `%${q}%`)];
  if (digits.length >= 4) parts.push(ilike(s.customers.phone, `%${digits}%`));
  parts.push(
    ilike(
      sql`coalesce(${s.customers.firstName}, '') || ' ' || coalesce(${s.customers.lastName}, '')`,
      `%${q}%`,
    ),
  );
  return or(...parts);
}

const startOfDay = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** Commandes dont le délai de paiement est dépassé : annulées avant affichage (stock libéré). */
async function expireOverdue(db: Db, now: Date) {
  const overdue = await db
    .select({ id: s.orders.id })
    .from(s.orders)
    .where(
      and(
        inArray(s.orders.status, AWAITING_PAYMENT),
        isNotNull(s.orders.paymentDeadline),
        lte(s.orders.paymentDeadline, now),
      ),
    );
  for (const o of overdue) await refreshOrder(db, o.id, now);
}

export async function listAdminOrders(
  db: Db,
  query: AdminOrderListQuery,
  now = new Date(),
): Promise<AdminOrderList> {
  await expireOverdue(db, now);

  const filters: (SQL | undefined)[] = [
    query.fulfillment ? eq(s.orders.fulfillment, query.fulfillment) : undefined,
    query.agencyId ? eq(s.orders.agencyId, query.agencyId) : undefined,
    query.paymentMethod ? eq(s.orders.paymentMethod, query.paymentMethod) : undefined,
    query.from ? gte(s.orders.createdAt, startOfDay(query.from)) : undefined,
    query.to
      ? lt(s.orders.createdAt, new Date(startOfDay(query.to).getTime() + 86_400_000))
      : undefined,
    query.q ? searchCondition(query.q) : undefined,
  ];
  const statuses = query.tab === 'all' ? null : ADMIN_ORDER_TABS[query.tab];
  // Onglets de travail : par créneau (le plus urgent d'abord) ; les autres : les plus récentes d'abord.
  const bySlot =
    query.tab === 'to_prepare' || query.tab === 'preparing' || query.tab === 'dispatch';
  const start = decodeCursor(query.cursor);

  const [rows, grouped] = await Promise.all([
    db
      .select({ order: s.orders, customer: s.customers })
      .from(s.orders)
      .innerJoin(s.customers, eq(s.customers.id, s.orders.customerId))
      .where(and(...filters, statuses ? inArray(s.orders.status, [...statuses]) : undefined))
      .orderBy(
        ...(bySlot
          ? [asc(sql`${s.orders.slot}->>'start'`), asc(s.orders.createdAt)]
          : [desc(s.orders.createdAt)]),
      )
      .limit(PAGE + 1)
      .offset(start),
    db
      .select({ status: s.orders.status, n: count() })
      .from(s.orders)
      .innerJoin(s.customers, eq(s.customers.id, s.orders.customerId))
      .where(and(...filters))
      .groupBy(s.orders.status),
  ]);

  const counts = { all: 0 } as Record<AdminOrderTab, number>;
  for (const tab of Object.keys(ADMIN_ORDER_TABS) as Exclude<AdminOrderTab, 'all'>[]) {
    counts[tab] = grouped
      .filter((g) => ADMIN_ORDER_TABS[tab].includes(g.status))
      .reduce((n, g) => n + g.n, 0);
  }
  counts.all = grouped.reduce((n, g) => n + g.n, 0);

  return {
    items: rows.slice(0, PAGE).map(({ order, customer }) => toRow(order, customer)),
    nextCursor: rows.length > PAGE ? encodeCursor(start + PAGE) : null,
    counts,
  };
}

function toRow(o: OrderRow, c: typeof s.customers.$inferSelect): AdminOrderRow {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    customer: { id: c.id, name: customerName(c), phone: c.phone },
    fulfillment: o.fulfillment,
    fulfillmentSummary: o.fulfillmentSummary,
    slot: o.slot as Slot,
    total: o.total,
    itemCount: o.itemCount,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    amountDue: amountDue(o),
  };
}

// ─── Détail ──────────────────────────────────────────────────────────────────

async function loadOrder(db: Db, orderId: string): Promise<OrderRow> {
  const [o] = await db.select().from(s.orders).where(eq(s.orders.id, orderId));
  if (!o) throw new ApiError('NOT_FOUND', 'Commande introuvable.');
  return o;
}

export async function getAdminOrder(
  db: Db,
  orderId: string,
  role: AdminRole,
  now = new Date(),
): Promise<AdminOrderDetail> {
  await refreshOrder(db, orderId, now);
  const o = await loadOrder(db, orderId);

  const [[customer], [address], [agency], lines, events, payments, notes] = await Promise.all([
    db.select().from(s.customers).where(eq(s.customers.id, o.customerId)),
    o.addressId
      ? db.select().from(s.addresses).where(eq(s.addresses.id, o.addressId))
      : Promise.resolve([]),
    o.agencyId
      ? db.select().from(s.agencies).where(eq(s.agencies.id, o.agencyId))
      : Promise.resolve([]),
    db
      .select({ snapshot: s.orderLines.snapshot })
      .from(s.orderLines)
      .where(eq(s.orderLines.orderId, o.id))
      .orderBy(asc(s.orderLines.sortOrder)),
    db
      .select()
      .from(s.orderStatusEvents)
      .where(eq(s.orderStatusEvents.orderId, o.id))
      .orderBy(asc(s.orderStatusEvents.at), asc(s.orderStatusEvents.id)),
    db
      .select()
      .from(s.payments)
      .where(eq(s.payments.orderId, o.id))
      .orderBy(asc(s.payments.createdAt)),
    db
      .select({
        id: s.orderNotes.id,
        text: s.orderNotes.text,
        at: s.orderNotes.createdAt,
        author: s.adminUsers.name,
      })
      .from(s.orderNotes)
      .innerJoin(s.adminUsers, eq(s.adminUsers.id, s.orderNotes.adminId))
      .where(eq(s.orderNotes.orderId, o.id))
      .orderBy(asc(s.orderNotes.createdAt)),
  ]);
  if (!customer) throw new ApiError('NOT_FOUND', 'Client introuvable.');

  const adminIds = [
    ...new Set(
      events
        .map((e) => e.actor)
        .filter((a) => a.startsWith('admin:'))
        .map((a) => a.slice(6)),
    ),
  ];
  const admins = adminIds.length
    ? await db
        .select({ id: s.adminUsers.id, name: s.adminUsers.name })
        .from(s.adminUsers)
        .where(inArray(s.adminUsers.id, adminIds))
    : [];
  const actorName = (actor: string) =>
    actor === 'customer'
      ? 'Client'
      : actor.startsWith('admin:')
        ? (admins.find((a) => a.id === actor.slice(6))?.name ?? 'Équipe')
        : 'Système';

  const zone = address?.zoneId
    ? (
        await db
          .select({ name: s.deliveryZones.name })
          .from(s.deliveryZones)
          .where(eq(s.deliveryZones.id, address.zoneId))
      )[0]
    : undefined;

  return {
    ...toRow(o, customer),
    customer: {
      id: customer.id,
      name: customerName(customer),
      phone: customer.phone,
      email: customer.email,
      segmentLabel: SEGMENT_LABELS[customer.segment] ?? customer.segment,
    },
    lines: lines.map((l) => l.snapshot as ValidatedCartLine),
    subtotal: o.subtotal,
    deliveryFee: o.deliveryFee,
    discountTotal: o.discountTotal,
    deliveryBonus: o.deliveryBonus,
    storeCreditUsed: o.storeCreditUsed,
    address: address
      ? {
          label: address.label,
          recipientName: address.recipientName,
          phone: address.phone,
          district: address.district,
          city: address.city,
          landmark: address.landmark,
          instructions: address.instructions,
          location:
            address.latitude !== null && address.longitude !== null
              ? {
                  latitude: address.latitude,
                  longitude: address.longitude,
                  accuracy: address.accuracy,
                }
              : null,
          zoneName: zone?.name ?? null,
        }
      : null,
    agency: agency ? { id: agency.id, name: agency.name, address: agency.address } : null,
    paymentDeadline: AWAITING_PAYMENT.includes(o.status)
      ? (o.paymentDeadline?.toISOString() ?? null)
      : null,
    paidAt: o.paidAt?.toISOString() ?? null,
    payments: payments.map((p) => ({
      id: p.id,
      method: p.method,
      provider: p.provider,
      status: p.status,
      amount: p.amount,
      phone: p.phone,
      createdAt: p.createdAt.toISOString(),
      failureReason: p.failureReason,
    })),
    history: events.map((e) => ({
      status: e.status,
      at: e.at.toISOString(),
      note: e.note,
      actor: actorName(e.actor),
    })),
    notes: notes.map((n) => ({ id: n.id, text: n.text, at: n.at.toISOString(), author: n.author })),
    allowedActions: allowedActions(o, role),
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Vérifie que la commande est toujours dans l'état affiché à la personne qui agit. */
async function current(db: Db, orderId: string, expected: OrderStatus): Promise<OrderRow> {
  const o = await loadOrder(db, orderId);
  if (o.status !== expected) throw changed(o.status);
  return o;
}

export async function transitionAdminOrder(
  db: Db,
  ctx: AdminContext,
  orderId: string,
  body: AdminTransitionBody,
  ip: string,
  now = new Date(),
) {
  await refreshOrder(db, orderId, now);
  const o = await current(db, orderId, body.expectedStatus);
  const step = STEPS[body.action];
  if (!step.from.includes(o.status) || (step.fulfillment && step.fulfillment !== o.fulfillment)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Cette étape n’est pas possible pour cette commande.',
      undefined,
      422,
    );
  }
  if (body.action === 'delivery_failed' && !body.note) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Indiquez le motif (client absent, adresse introuvable…).',
      { field: 'note' },
      422,
    );
  }
  if (step.final && amountDue(o) > 0) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Encaissez d'abord le paiement (${o.total} F) avant de clôturer la commande.`,
      undefined,
      422,
    );
  }
  if (
    body.action === 'complete_pickup' &&
    !(body.pickupCode && o.pickupCode && safeEqual(body.pickupCode, o.pickupCode))
  ) {
    await adminAudit(db, {
      actorId: ctx.admin.id,
      action: 'order.pickup_code_rejected',
      entity: 'order',
      entityId: o.id,
      ip,
    });
    throw new ApiError(
      'VALIDATION_ERROR',
      'Code de retrait incorrect : ne remettez pas la commande.',
      { field: 'pickupCode' },
      422,
    );
  }

  const note =
    body.action === 'delivery_failed'
      ? `Livraison reportée : ${body.note}`
      : body.note
        ? `${step.note} — ${body.note}`
        : step.note;
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const done = await transition(
      tx,
      o.id,
      [o.status],
      step.to,
      note,
      now,
      {},
      `admin:${ctx.admin.id}`,
    );
    if (!done) throw changed((await loadOrder(tx, o.id)).status);
    if (step.final) await closeReservations(tx, o.id, 'consume', now);
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: `order.${body.action}`,
      entity: 'order',
      entityId: o.id,
      ip,
      before: { status: o.status },
      after: { status: step.to, note },
    });
  });
  return getAdminOrder(db, o.id, ctx.admin.role, now);
}

/** Paiement reçu en main propre (livreur ou agence) : enregistré comme un paiement réussi. */
export async function collectPayment(
  db: Db,
  ctx: AdminContext,
  orderId: string,
  body: AdminCollectBody,
  ip: string,
  now = new Date(),
) {
  const o = await current(db, orderId, body.expectedStatus);
  const due = amountDue(o);
  if (due === 0 || AWAITING_PAYMENT.includes(o.status)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Aucun paiement à encaisser pour cette commande.',
      undefined,
      422,
    );
  }
  if (body.amount !== due) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Le montant encaissé doit être de ${due} F.`,
      { field: 'amount', expected: due },
      422,
    );
  }
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const paymentId = newId('pay');
    await tx.insert(s.payments).values({
      id: paymentId,
      orderId: o.id,
      provider: 'manual',
      providerData: { collectedBy: ctx.admin.id },
      method: o.paymentMethod,
      amount: due,
      status: 'succeeded',
      expiresAt: now,
      settledAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const updated = await tx
      .update(s.orders)
      .set({ paymentStatus: 'succeeded', paidAt: now, currentPaymentId: paymentId, updatedAt: now })
      .where(
        and(
          eq(s.orders.id, o.id),
          eq(s.orders.status, o.status),
          sql`${s.orders.paymentStatus} <> 'succeeded'`,
        ),
      )
      .returning({ id: s.orders.id });
    if (updated.length === 0) throw changed(o.status);
    await emit(tx, 'order.paid', o.id, {
      paymentId,
      amount: due,
      method: o.paymentMethod,
      collectedBy: ctx.admin.id,
    });
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: 'order.payment_collected',
      entity: 'order',
      entityId: o.id,
      ip,
      after: { amount: due, method: o.paymentMethod },
    });
  });
  return getAdminOrder(db, o.id, ctx.admin.role, now);
}

/** Annulation par l'équipe (motif obligatoire, visible par le client) ; remboursement si déjà payée. */
export async function cancelByAdmin(
  db: Db,
  ctx: AdminContext,
  orderId: string,
  body: AdminCancelBody,
  ip: string,
  now = new Date(),
) {
  await refreshOrder(db, orderId, now);
  const o = await current(db, orderId, body.expectedStatus);
  if (!OPEN.includes(o.status))
    throw new ApiError('ORDER_NOT_CANCELLABLE', 'Cette commande est déjà terminée.');
  const paid = o.paymentStatus === 'succeeded';
  const [payment] =
    paid && o.currentPaymentId
      ? await db.select().from(s.payments).where(eq(s.payments.id, o.currentPaymentId))
      : [];
  const online = payment && payment.provider !== 'manual';

  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const actor = `admin:${ctx.admin.id}`;
    const done = await transition(
      tx,
      o.id,
      [o.status],
      'cancelled',
      `Annulée par AfriSime : ${body.reason}`,
      now,
      {},
      actor,
    );
    if (!done) throw changed((await loadOrder(tx, o.id)).status);
    await closeReservations(tx, o.id, 'release', now);
    await emit(tx, 'order.cancelled', o.id, { reason: 'admin', by: ctx.admin.id });
    if (paid) {
      const note = online
        ? `Remboursement ${PAYMENT_LABELS[o.paymentMethod]} sous 48 h`
        : 'Montant rendu au client';
      await transition(
        tx,
        o.id,
        ['cancelled'],
        'refunded',
        note,
        now,
        { paymentStatus: 'refunded' },
        actor,
      );
      if (payment)
        await tx
          .update(s.payments)
          .set({ status: 'refunded', updatedAt: now })
          .where(eq(s.payments.id, payment.id));
      await emit(tx, 'order.refunded', o.id, { amount: o.total, by: ctx.admin.id });
    }
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: 'order.cancelled',
      entity: 'order',
      entityId: o.id,
      ip,
      before: { status: o.status, paymentStatus: o.paymentStatus },
      after: { reason: body.reason, refunded: paid },
    });
  });

  if (online && payment && (payment.method === 'mixx' || payment.method === 'flooz')) {
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
      .catch((error: unknown) =>
        log.error('remboursement en échec : à traiter manuellement', { orderId: o.id, error }),
      );
  }
  return getAdminOrder(db, o.id, ctx.admin.role, now);
}

export async function addOrderNote(
  db: Db,
  ctx: AdminContext,
  orderId: string,
  text: string,
  now = new Date(),
) {
  await loadOrder(db, orderId);
  await db.insert(s.orderNotes).values({ orderId, adminId: ctx.admin.id, text, createdAt: now });
  return getAdminOrder(db, orderId, ctx.admin.role, now);
}
