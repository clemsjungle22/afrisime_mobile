import { validateCart } from '@afrisime/shared';
import {
  FINAL_ORDER_STATUSES,
  type CreateOrderBody,
  type CreatePaymentBody,
  type Order,
  type OrderStatus,
  type OrderStatusEvent,
  type PaymentIntent,
  type ProductDetail,
  type Quote,
  type ReorderResponse,
} from '@afrisime/shared';
import { loadDb, saveDb, type MockDb, type MockPayment } from './db';
import { mockError } from './simulate';

/**
 * FAUX serveur des commandes et paiements (mode mock).
 * - Idempotency-Key obligatoire sur POST /orders et POST /payments (RB-003).
 * - Paiement Mobile Money simulé selon la fin du numéro : …0002 échec, …0003 expire, sinon succès (~5 s).
 * - Progression des commandes simulée à la lecture : préparation +2 min, expédition +5 min, livrée +10 min.
 */

export const PAYMENT_CONFIRM_MS = 5_000;
export const PAYMENT_FAIL_MS = 4_000;
export const PAYMENT_TTL_MS = 90_000;
export const PAYMENT_DEADLINE_MS = 30 * 60_000;
const STEP_PREPARING_MS = 2 * 60_000;
const STEP_SHIPPING_MS = 5 * 60_000;
const STEP_DONE_MS = 10 * 60_000;

const MOBILE_MONEY = new Set(['mixx', 'flooz']);
const CANCELLABLE: ReadonlySet<OrderStatus> = new Set(['pending_payment', 'payment_failed', 'confirmed']);

/** Devis émis (en mémoire : un devis expire en 15 min, inutile de le persister). */
const quotes = new Map<string, { userId: string; quote: Quote }>();
let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export function registerQuote(userId: string, quote: Quote): void {
  quotes.set(quote.quoteId, { userId, quote });
}

export function resetOrderServer(): void {
  quotes.clear();
}

const hash = (body: unknown) => JSON.stringify(body);

/** Idempotence : retourne l'identifiant déjà créé pour cette clé, ou null. 409 si corps différent. */
function idempotent(db: MockDb, key: string, route: string, body: unknown): string | null {
  const existing = db.idempotency[key];
  if (!existing) return null;
  if (existing.route !== route || existing.bodyHash !== hash(body)) {
    throw mockError('IDEMPOTENCY_CONFLICT', 'Requête déjà traitée avec un contenu différent.', 409);
  }
  return existing.resourceId;
}

function requireKey(key: string | undefined): string {
  if (!key) throw mockError('VALIDATION_ERROR', 'Idempotency-Key requise.', 400);
  return key;
}

function event(status: OrderStatus, at: number, note: string | null = null): OrderStatusEvent {
  return { status, at: new Date(at).toISOString(), note };
}

function pickupCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── Commandes ────────────────────────────────────────────────────────────────

export async function createOrder(userId: string, body: CreateOrderBody, key: string | undefined, now = Date.now()) {
  const k = requireKey(key);
  const db = await loadDb();
  const existingId = idempotent(db, k, 'POST /orders', body);
  if (existingId) return getOrder(userId, existingId, now);

  const entry = quotes.get(body.quoteId);
  if (!entry || entry.userId !== userId) {
    throw mockError('QUOTE_EXPIRED', 'Ce devis n’est plus valable. Vérifiez votre commande.', 409);
  }
  if (Date.parse(entry.quote.expiresAt) <= now) {
    quotes.delete(body.quoteId);
    throw mockError('QUOTE_EXPIRED', 'Les prix garantis ont expiré. Vérifiez votre commande.', 409);
  }
  const q = entry.quote;
  const online = MOBILE_MONEY.has(q.paymentMethod);
  const orderCounter = db.orderCounter + 1;
  const year = new Date(now).getUTCFullYear();

  const order: Order = {
    id: newId('ord'),
    orderNumber: `AFS-${year}-${String(orderCounter).padStart(6, '0')}`,
    status: online ? 'pending_payment' : 'confirmed',
    createdAt: new Date(now).toISOString(),
    total: q.total,
    itemCount: q.lines.reduce((n, l) => n + l.quantity, 0),
    fulfillment: q.fulfillment,
    fulfillmentSummary: q.fulfillmentSummary,
    slot: q.slot,
    payable: online,
    lines: q.lines,
    subtotal: q.subtotal,
    deliveryFee: q.deliveryFee,
    discountTotal: q.discountTotal,
    currency: 'XOF',
    addressId: q.addressId,
    agencyId: q.agencyId,
    pickupCode: q.fulfillment === 'pickup' ? pickupCode() : null,
    payment: { method: q.paymentMethod, status: online ? 'initiated' : 'pending', paymentId: null, paidAt: null },
    history: online
      ? [event('pending_payment', now, 'En attente du paiement')]
      : [
          event(
            'confirmed',
            now,
            q.paymentMethod === 'cash_on_delivery' ? 'Paiement à la livraison' : 'Paiement au retrait en agence',
          ),
        ],
    cancellable: true,
    paymentDeadline: online ? new Date(now + PAYMENT_DEADLINE_MS).toISOString() : null,
  };
  quotes.delete(body.quoteId);
  await saveDb({
    ...db,
    orderCounter,
    orders: { ...db.orders, [userId]: [order, ...(db.orders[userId] ?? [])] },
    idempotency: { ...db.idempotency, [k]: { route: 'POST /orders', bodyHash: hash(body), resourceId: order.id } },
  });
  return order;
}

/** Statut « vu maintenant » : expiration du paiement, progression simulée, droits d'action. */
export function materialize(stored: Order, now: number): Order {
  const order: Order = { ...stored, history: [...stored.history] };
  const last = order.history[order.history.length - 1]!;

  if ((order.status === 'pending_payment' || order.status === 'payment_failed') && order.paymentDeadline) {
    const deadline = Date.parse(order.paymentDeadline);
    if (now >= deadline) {
      order.status = 'cancelled';
      order.history.push(event('cancelled', deadline, 'Annulée : paiement non reçu à temps'));
    }
  }

  if (order.status === 'confirmed') {
    const t0 = Date.parse(last.at);
    const steps: [number, OrderStatus, string][] = [
      [STEP_PREPARING_MS, 'preparing', 'Votre commande est en préparation'],
      order.fulfillment === 'delivery'
        ? [STEP_SHIPPING_MS, 'out_for_delivery', 'Le livreur est en route']
        : [STEP_SHIPPING_MS, 'ready_for_pickup', 'Prête : présentez votre code en agence'],
      order.fulfillment === 'delivery'
        ? [STEP_DONE_MS, 'delivered', 'Livrée']
        : [STEP_DONE_MS, 'completed', 'Retirée en agence'],
    ];
    for (const [delay, status, note] of steps) {
      if (now >= t0 + delay) {
        order.status = status;
        order.history.push(event(status, t0 + delay, note));
      }
    }
  }

  order.cancellable = CANCELLABLE.has(order.status);
  order.payable =
    (order.status === 'pending_payment' || order.status === 'payment_failed') && MOBILE_MONEY.has(order.payment.method);
  return order;
}

async function findOrder(userId: string, orderId: string): Promise<{ db: MockDb; order: Order }> {
  const db = await loadDb();
  const order = (db.orders[userId] ?? []).find((o) => o.id === orderId);
  if (!order) throw mockError('NOT_FOUND', 'Commande introuvable.', 404);
  return { db, order };
}

async function saveOrder(db: MockDb, userId: string, order: Order): Promise<void> {
  await saveDb({
    ...db,
    orders: { ...db.orders, [userId]: (db.orders[userId] ?? []).map((o) => (o.id === order.id ? order : o)) },
  });
}

export async function getOrder(userId: string, orderId: string, now = Date.now()): Promise<Order> {
  // Rafraîchit le paiement en cours éventuel (le webhook PSP côté vrai serveur).
  const { order } = await findOrder(userId, orderId);
  if (order.payment.paymentId) await getPayment(userId, order.payment.paymentId, now);
  return materialize((await findOrder(userId, orderId)).order, now);
}

export async function listOrders(userId: string, filter: 'active' | 'history', now = Date.now()): Promise<Order[]> {
  const db = await loadDb();
  return (db.orders[userId] ?? [])
    .map((o) => materialize(o, now))
    .filter((o) => (filter === 'history' ? FINAL_ORDER_STATUSES.has(o.status) : !FINAL_ORDER_STATUSES.has(o.status)));
}

export async function cancelOrder(userId: string, orderId: string, now = Date.now()): Promise<Order> {
  const { db, order: stored } = await findOrder(userId, orderId);
  const current = materialize(stored, now);
  if (!current.cancellable) {
    throw mockError('ORDER_NOT_CANCELLABLE', 'Cette commande est déjà en préparation : elle ne peut plus être annulée.', 409);
  }
  const paid = current.payment.status === 'succeeded';
  const cancelled: Order = {
    ...current,
    status: paid ? 'refunded' : 'cancelled',
    history: [
      ...current.history,
      event('cancelled', now, 'Annulée à votre demande'),
      ...(paid ? [event('refunded', now, 'Remboursement Mobile Money sous 48 h')] : []),
    ],
    payment: { ...current.payment, status: paid ? 'refunded' : current.payment.status },
    cancellable: false,
    payable: false,
  };
  await saveOrder(db, userId, cancelled);
  return cancelled;
}

export async function reorder(
  userId: string,
  orderId: string,
  ctx: { products: ProductDetail[]; stock: ReadonlyMap<string, number> },
): Promise<ReorderResponse> {
  const { order } = await findOrder(userId, orderId);
  const validated = validateCart(
    {
      lines: order.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.requestedQuantity,
        expectedUnitPrice: l.unitPrice,
        expectedAvailability: 'available',
      })),
    },
    { products: ctx.products, stock: ctx.stock },
  );
  return { lines: validated.lines };
}

// ─── Paiements ────────────────────────────────────────────────────────────────

function outcomeFor(phone: string): MockPayment['outcome'] {
  if (phone.endsWith('0002')) return 'fail';
  if (phone.endsWith('0003')) return 'expire';
  return 'succeed';
}

const OPERATOR_HINT: Record<MockPayment['method'], string> = {
  mixx: 'Validez la demande Mixx by Yas reçue sur votre téléphone avec votre code secret.',
  flooz: 'Validez la demande Flooz reçue sur votre téléphone avec votre code secret.',
};

function toIntent(p: MockPayment, now: number): PaymentIntent {
  const elapsed = now - Date.parse(p.createdAt);
  let status: PaymentIntent['status'] = p.settled ?? 'pending';
  if (!p.settled) {
    if (p.outcome === 'succeed' && elapsed >= PAYMENT_CONFIRM_MS) status = 'succeeded';
    else if (p.outcome === 'fail' && elapsed >= PAYMENT_FAIL_MS) status = 'failed';
    else if (now >= Date.parse(p.expiresAt)) status = 'expired';
  }
  return {
    id: p.id,
    orderId: p.orderId,
    method: p.method,
    status,
    amount: p.amount,
    action: { type: 'confirm_on_phone', url: null, instructions: OPERATOR_HINT[p.method] },
    expiresAt: p.expiresAt,
    failureReason:
      status === 'failed'
        ? 'Solde insuffisant ou paiement refusé. Vérifiez votre compte puis réessayez.'
        : status === 'expired'
          ? 'Délai de confirmation dépassé.'
          : null,
  };
}

/** Fige l'issue d'un paiement et met à jour la commande UNE seule fois (comme un webhook idempotent). */
async function settle(p: MockPayment, intent: PaymentIntent, now: number): Promise<void> {
  if (p.settled || intent.status === 'pending' || intent.status === 'initiated') return;
  const db = await loadDb();
  const settledStatus = intent.status as MockPayment['settled'];
  const orders = db.orders[p.userId] ?? [];
  const nextOrders = orders.map((o) => {
    if (o.id !== p.orderId) return o;
    if (intent.status === 'succeeded') {
      return {
        ...o,
        status: 'confirmed' as const,
        payment: { ...o.payment, status: 'succeeded' as const, paidAt: new Date(now).toISOString() },
        history: [...o.history, event('confirmed', now, `Paiement ${p.method === 'mixx' ? 'Mixx by Yas' : 'Flooz'} reçu`)],
      };
    }
    return {
      ...o,
      status: 'payment_failed' as const,
      payment: { ...o.payment, status: intent.status === 'expired' ? ('expired' as const) : ('failed' as const) },
      history: [...o.history, event('payment_failed', now, intent.failureReason)],
    };
  });
  await saveDb({
    ...db,
    payments: { ...db.payments, [p.id]: { ...p, settled: settledStatus } },
    orders: { ...db.orders, [p.userId]: nextOrders },
  });
}

export async function createPayment(userId: string, body: CreatePaymentBody, key: string | undefined, now = Date.now()) {
  const k = requireKey(key);
  const db = await loadDb();
  const existingId = idempotent(db, k, 'POST /payments', body);
  if (existingId) return getPayment(userId, existingId, now);

  const { order: stored } = await findOrder(userId, body.orderId);
  const order = materialize(stored, now);
  if (!order.payable) throw mockError('ORDER_NOT_PAYABLE', 'Cette commande n’attend pas de paiement.', 409);
  if (body.method !== 'mixx' && body.method !== 'flooz') {
    throw mockError('PAYMENT_METHOD_UNAVAILABLE', 'Ce moyen de paiement ne se règle pas en ligne.', 422);
  }
  if (!body.phone) throw mockError('VALIDATION_ERROR', 'Numéro Mobile Money requis.', 422);

  // RB-003 : une tentative encore en cours est renvoyée telle quelle (jamais deux débits simultanés).
  const active = Object.values(db.payments).find(
    (p) => p.orderId === order.id && !p.settled && toIntent(p, now).status === 'pending',
  );
  if (active) return toIntent(active, now);

  const payment: MockPayment = {
    id: newId('pay'),
    orderId: order.id,
    userId,
    method: body.method,
    phone: body.phone,
    amount: order.total,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PAYMENT_TTL_MS).toISOString(),
    outcome: outcomeFor(body.phone),
    settled: null,
  };
  await saveDb({
    ...db,
    payments: { ...db.payments, [payment.id]: payment },
    idempotency: { ...db.idempotency, [k]: { route: 'POST /payments', bodyHash: hash(body), resourceId: payment.id } },
    orders: {
      ...db.orders,
      [userId]: (db.orders[userId] ?? []).map((o) =>
        o.id === order.id
          ? { ...o, payment: { ...o.payment, method: body.method, status: 'pending' as const, paymentId: payment.id } }
          : o,
      ),
    },
  });
  return toIntent(payment, now);
}

export async function getPayment(userId: string, paymentId: string, now = Date.now()): Promise<PaymentIntent> {
  const db = await loadDb();
  const p = db.payments[paymentId];
  if (!p || p.userId !== userId) throw mockError('NOT_FOUND', 'Paiement introuvable.', 404);
  const intent = toIntent(p, now);
  await settle(p, intent, now);
  return intent;
}
