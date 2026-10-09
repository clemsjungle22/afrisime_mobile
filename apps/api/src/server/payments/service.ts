import { type CreatePaymentBody, ONLINE_PAYMENT_METHODS, PAYMENT_LABELS, type PaymentAction, type PaymentIntent } from '@afrisime/shared';
import { and, eq, gt, inArray, lte } from 'drizzle-orm';
import { settleContributionByReference } from '../carnets/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { once } from '../idempotency';
import { log } from '../log';
import { AWAITING_PAYMENT, refreshOrder, transition } from '../orders/state';
import { emit } from '../outbox';
import { type ProviderPayment, type ProviderStatus, paymentProvider } from './provider';

/** Durée laissée au client pour confirmer sur son téléphone. */
export const PAYMENT_TTL_MS = 90_000;

type PaymentRow = typeof s.payments.$inferSelect;
type StoredData = { provider?: unknown; action?: PaymentAction };

const notFound = () => new ApiError('NOT_FOUND', 'Paiement introuvable.');

function toProviderPayment(p: PaymentRow): ProviderPayment {
  return {
    id: p.id,
    method: p.method as 'mixx' | 'flooz',
    amount: p.amount,
    phone: p.phone ?? '',
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    providerReference: p.providerReference,
    providerData: (p.providerData as StoredData | null)?.provider ?? null,
  };
}

function toIntent(p: PaymentRow): PaymentIntent {
  return {
    id: p.id,
    orderId: p.orderId,
    method: p.method,
    status: p.status,
    amount: p.amount,
    action: (p.providerData as StoredData | null)?.action ?? { type: 'none', url: null, instructions: null },
    expiresAt: p.expiresAt.toISOString(),
    failureReason: p.failureReason,
  };
}

/**
 * Enregistre l'issue d'un paiement UNE seule fois (webhook reçu deux fois, webhook + vérification…),
 * puis met la commande à jour dans la même transaction.
 */
export async function settle(
  db: Db,
  paymentId: string,
  status: Exclude<ProviderStatus, 'pending'>,
  failureReason: string | null,
  at = new Date(),
): Promise<boolean> {
  let refundNeeded: PaymentRow | null = null;
  const applied = await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const [payment] = await tx
      .update(s.payments)
      .set({ status, failureReason, settledAt: at, updatedAt: at })
      .where(and(eq(s.payments.id, paymentId), inArray(s.payments.status, ['initiated', 'pending'])))
      .returning();
    if (!payment) return false;

    const [order] = await tx.select().from(s.orders).where(eq(s.orders.id, payment.orderId));
    if (!order) return true;
    // Seule la tentative en cours fait foi pour la commande (une ancienne tentative ne l'écrase pas).
    const current = order.currentPaymentId === payment.id;

    if (status === 'succeeded') {
      const confirmed = await transition(tx, order.id, AWAITING_PAYMENT, 'confirmed', `Paiement ${PAYMENT_LABELS[payment.method]} reçu`, at, {
        paymentStatus: 'succeeded',
        paidAt: at,
        currentPaymentId: payment.id,
        paymentMethod: payment.method,
      });
      if (confirmed) {
        await emit(tx, 'order.paid', order.id, { paymentId: payment.id, amount: payment.amount, method: payment.method });
      } else if (order.status === 'cancelled') {
        // Argent reçu après l'annulation (délai dépassé) : on le rend.
        await transition(tx, order.id, ['cancelled'], 'refunded', "Paiement reçu après l'annulation : remboursé", at, {
          paymentStatus: 'refunded',
        });
        await tx.update(s.payments).set({ status: 'refunded' }).where(eq(s.payments.id, payment.id));
        await emit(tx, 'order.refunded', order.id, { paymentId: payment.id, amount: payment.amount });
        refundNeeded = payment;
      }
      return true;
    }

    if (current) {
      const failed = status === 'expired' ? 'expired' : 'failed';
      const moved = await transition(tx, order.id, ['pending_payment'], 'payment_failed', failureReason, at, { paymentStatus: failed });
      if (!moved && order.status === 'payment_failed') {
        await tx.update(s.orders).set({ paymentStatus: failed, updatedAt: at }).where(eq(s.orders.id, order.id));
      }
    }
    return true;
  });

  if (refundNeeded) {
    const p = refundNeeded as PaymentRow;
    await paymentProvider(p.provider)
      .refund(toProviderPayment(p))
      .catch((error: unknown) => log.error('remboursement en échec : à traiter manuellement', { paymentId: p.id, error }));
  }
  return applied;
}

/** Rattrapage : demande l'état au prestataire si le paiement est encore en attente. */
export async function refreshPayment(db: Db, paymentId: string, now = new Date()) {
  const [p] = await db.select().from(s.payments).where(eq(s.payments.id, paymentId));
  if (!p || (p.status !== 'pending' && p.status !== 'initiated')) return;
  const result = await paymentProvider(p.provider).fetchStatus(toProviderPayment(p), now);
  if (result.status !== 'pending') await settle(db, p.id, result.status, result.failureReason, now);
}

export async function getPayment(db: Db, customerId: string, paymentId: string, now = new Date()): Promise<PaymentIntent> {
  const own = async () => {
    const [row] = await db
      .select({ payment: s.payments })
      .from(s.payments)
      .innerJoin(s.orders, eq(s.orders.id, s.payments.orderId))
      .where(and(eq(s.payments.id, paymentId), eq(s.orders.customerId, customerId)));
    if (!row) throw notFound();
    return row.payment;
  };
  await own();
  await refreshPayment(db, paymentId, now);
  return toIntent(await own());
}

/**
 * Lance un paiement Mobile Money pour une commande en attente.
 * Jamais deux débits en cours pour la même commande : une tentative encore active est renvoyée telle quelle.
 */
export async function createPayment(
  db: Db,
  customerId: string,
  body: CreatePaymentBody,
  key: string,
  now = new Date(),
): Promise<PaymentIntent> {
  const [owned] = await db
    .select({ id: s.orders.id, paymentId: s.orders.currentPaymentId })
    .from(s.orders)
    .where(and(eq(s.orders.id, body.orderId), eq(s.orders.customerId, customerId)));
  if (!owned) throw new ApiError('NOT_FOUND', 'Commande introuvable.');
  if (owned.paymentId) await refreshPayment(db, owned.paymentId, now);
  await refreshOrder(db, owned.id, now);

  return once(
    db,
    { customerId, key, route: 'POST /v1/payments', body },
    async (tx) => {
      const [order] = await tx.select().from(s.orders).where(eq(s.orders.id, body.orderId));
      if (!order || !AWAITING_PAYMENT.includes(order.status) || !ONLINE_PAYMENT_METHODS.has(order.paymentMethod)) {
        throw new ApiError('ORDER_NOT_PAYABLE', "Cette commande n'attend pas de paiement.");
      }
      if (body.method !== 'mixx' && body.method !== 'flooz') {
        throw new ApiError('PAYMENT_METHOD_UNAVAILABLE', 'Ce moyen de paiement ne se règle pas en ligne.', undefined, 422);
      }
      if (!body.phone) throw new ApiError('VALIDATION_ERROR', 'Numéro Mobile Money requis.', undefined, 422);

      const [active] = await tx
        .select({ id: s.payments.id })
        .from(s.payments)
        .where(
          and(
            eq(s.payments.orderId, order.id),
            inArray(s.payments.status, ['initiated', 'pending']),
            gt(s.payments.expiresAt, now),
          ),
        );
      if (active) return active.id;

      const provider = paymentProvider();
      const id = newId('pay');
      const draft: ProviderPayment = {
        id,
        method: body.method,
        amount: order.total,
        phone: body.phone,
        createdAt: now,
        expiresAt: new Date(now.getTime() + PAYMENT_TTL_MS),
        providerReference: null,
        providerData: null,
      };
      // Appel au prestataire dans la transaction : si la demande échoue, rien n'est enregistré.
      const started = await provider.initiate(draft);
      await tx.insert(s.payments).values({
        id,
        orderId: order.id,
        provider: provider.name,
        providerReference: started.reference,
        providerData: { provider: started.data, action: started.action } satisfies StoredData,
        method: body.method,
        phone: body.phone,
        amount: order.total,
        status: 'pending',
        expiresAt: draft.expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      await tx
        .update(s.orders)
        .set({ paymentMethod: body.method, paymentStatus: 'pending', currentPaymentId: id, updatedAt: now })
        .where(eq(s.orders.id, order.id));
      return id;
    },
    (id) => getPayment(db, customerId, id, now),
  );
}

/**
 * Webhook d'un prestataire : signature vérifiée, chaque événement traité une seule fois.
 * Retourne false si la signature est invalide.
 */
export async function handleWebhook(db: Db, providerName: string, rawBody: string, headers: Headers): Promise<boolean> {
  const provider = paymentProvider(providerName);
  const event = provider.parseWebhook(rawBody, headers);
  if (!event) return false;

  const inserted = await db
    .insert(s.webhookEvents)
    .values({ provider: provider.name, eventId: event.eventId, payload: JSON.parse(rawBody) })
    .onConflictDoNothing()
    .returning({ id: s.webhookEvents.id });
  if (inserted.length === 0) return true; // déjà reçu

  const [payment] = await db
    .select({ id: s.payments.id })
    .from(s.payments)
    .where(and(eq(s.payments.provider, provider.name), eq(s.payments.providerReference, event.reference)));
  if (payment) {
    if (event.status !== 'pending') await settle(db, payment.id, event.status, event.failureReason);
  } else if (event.status === 'pending') {
    // Rien à enregistrer.
  } else if (!(await settleContributionByReference(db, provider.name, event.reference, event.status, event.failureReason))) {
    // Ni une commande ni une cotisation de carnet.
    log.warn('webhook pour un paiement inconnu', { provider: provider.name, reference: event.reference });
  }

  await db.update(s.webhookEvents).set({ processedAt: new Date() }).where(eq(s.webhookEvents.id, inserted[0]!.id));
  return true;
}

/** Paiements encore en attente depuis au moins `olderThanMs` (rattrapage planifié). */
export async function pendingPaymentIds(db: Db, now: Date, olderThanMs = 10_000): Promise<string[]> {
  const rows = await db
    .select({ id: s.payments.id })
    .from(s.payments)
    .where(and(inArray(s.payments.status, ['initiated', 'pending']), lte(s.payments.createdAt, new Date(now.getTime() - olderThanMs))));
  return rows.map((r) => r.id);
}
