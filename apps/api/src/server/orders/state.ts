import type { OrderStatus } from '@afrisime/shared';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { env } from '../env';
import { ApiError } from '../http/errors';
import { emit } from '../outbox';

/** Une commande payée en ligne et non payée dans ce délai est annulée (stock libéré). */
export const PAYMENT_DEADLINE_MS = 30 * 60_000;
/** Statuts dans lesquels le client peut encore annuler (RB-009). */
export const CANCELLABLE: ReadonlySet<OrderStatus> = new Set(['pending_payment', 'payment_failed', 'confirmed']);
export const AWAITING_PAYMENT: OrderStatus[] = ['pending_payment', 'payment_failed'];
export const IN_PROGRESS: OrderStatus[] = ['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery'];

/** Simulation de l'avancement (développement, ORDER_SIMULATION) : mêmes délais que le mode démo. */
const SIM_STEPS_MS = { preparing: 2 * 60_000, shipping: 5 * 60_000, done: 10 * 60_000 };

export type OrderRow = typeof s.orders.$inferSelect;

/**
 * Change le statut SEULEMENT si la commande est encore dans l'un des statuts `from`
 * (deux traitements concurrents ne peuvent pas appliquer la même transition deux fois).
 * Ajoute l'étape au suivi. Retourne false si la transition n'a pas eu lieu.
 */
export async function transition(
  tx: Db,
  orderId: string,
  from: readonly OrderStatus[],
  to: OrderStatus,
  note: string | null,
  at: Date,
  extra: Partial<typeof s.orders.$inferInsert> = {},
): Promise<boolean> {
  const updated = await tx
    .update(s.orders)
    .set({ ...extra, status: to, updatedAt: at })
    .where(and(eq(s.orders.id, orderId), inArray(s.orders.status, [...from])))
    .returning({ id: s.orders.id });
  if (updated.length === 0) return false;
  await tx.insert(s.orderStatusEvents).values({ orderId, status: to, note, at });
  await emit(tx, 'order.status_changed', orderId, { status: to, at: at.toISOString() });
  return true;
}

/**
 * Réserve le stock des lignes, agence par agence (l'agence préférée d'abord).
 * Mise à jour conditionnelle : le stock vendable ne peut jamais devenir négatif, même en concurrence.
 */
export async function reserveStock(
  tx: Db,
  orderId: string,
  lines: { variantId: string; quantity: number }[],
  preferredAgencyId: string | null,
) {
  const agencies = await tx
    .select({ id: s.agencies.id, isDefault: s.agencies.isDefault })
    .from(s.agencies)
    .where(eq(s.agencies.isActive, true))
    .orderBy(asc(s.agencies.sortOrder));
  const preferred = preferredAgencyId ?? agencies.find((a) => a.isDefault)?.id ?? null;
  const order = [...agencies].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));

  for (const line of lines) {
    let remaining = line.quantity;
    for (const agency of order) {
      if (remaining === 0) break;
      const [level] = await tx
        .select({ sellable: sql<number>`(${s.stockLevels.onHand} - ${s.stockLevels.reserved})::int` })
        .from(s.stockLevels)
        .where(and(eq(s.stockLevels.variantId, line.variantId), eq(s.stockLevels.agencyId, agency.id)));
      const take = Math.min(remaining, Math.max(0, Number(level?.sellable ?? 0)));
      if (take === 0) continue;
      const ok = await tx
        .update(s.stockLevels)
        .set({ reserved: sql`${s.stockLevels.reserved} + ${take}`, updatedAt: new Date() })
        .where(
          and(
            eq(s.stockLevels.variantId, line.variantId),
            eq(s.stockLevels.agencyId, agency.id),
            sql`${s.stockLevels.onHand} - ${s.stockLevels.reserved} >= ${take}`,
          ),
        )
        .returning({ variantId: s.stockLevels.variantId });
      if (ok.length === 0) continue;
      await tx.insert(s.stockReservations).values({ orderId, variantId: line.variantId, agencyId: agency.id, quantity: take });
      remaining -= take;
    }
    if (remaining > 0) {
      throw new ApiError('OUT_OF_STOCK', "Un article vient d'être épuisé. Vérifiez votre panier.", { variantId: line.variantId }, 409);
    }
  }
}

/**
 * Termine les réservations actives d'une commande :
 * - `release` : le stock redevient vendable (annulation, paiement non reçu) ;
 * - `consume` : la marchandise est partie (livrée ou retirée), le stock en main diminue.
 */
export async function closeReservations(tx: Db, orderId: string, mode: 'release' | 'consume', at: Date) {
  const active = await tx
    .update(s.stockReservations)
    .set({ releasedAt: at })
    .where(and(eq(s.stockReservations.orderId, orderId), isNull(s.stockReservations.releasedAt)))
    .returning();
  for (const r of active) {
    await tx
      .update(s.stockLevels)
      .set({
        reserved: sql`greatest(${s.stockLevels.reserved} - ${r.quantity}, 0)`,
        ...(mode === 'consume' ? { onHand: sql`greatest(${s.stockLevels.onHand} - ${r.quantity}, 0)` } : {}),
        updatedAt: at,
      })
      .where(and(eq(s.stockLevels.variantId, r.variantId), eq(s.stockLevels.agencyId, r.agencyId)));
  }
}

async function expireUnpaid(db: Db, order: OrderRow, now: Date) {
  if (!AWAITING_PAYMENT.includes(order.status) || !order.paymentDeadline || now < order.paymentDeadline) return;
  const deadline = order.paymentDeadline;
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const done = await transition(tx, order.id, AWAITING_PAYMENT, 'cancelled', 'Annulée : paiement non reçu à temps', deadline);
    if (!done) return;
    await closeReservations(tx, order.id, 'release', now);
    await emit(tx, 'order.cancelled', order.id, { reason: 'payment_deadline' });
  });
}

/** Développement : fait avancer une commande confirmée selon le temps écoulé, comme le mode démo. */
async function simulateProgress(db: Db, order: OrderRow, now: Date) {
  if (!IN_PROGRESS.includes(order.status)) return;
  const [confirmed] = await db
    .select({ at: s.orderStatusEvents.at })
    .from(s.orderStatusEvents)
    .where(and(eq(s.orderStatusEvents.orderId, order.id), eq(s.orderStatusEvents.status, 'confirmed')))
    .orderBy(asc(s.orderStatusEvents.at))
    .limit(1);
  if (!confirmed) return;
  const t0 = confirmed.at.getTime();
  const delivery = order.fulfillment === 'delivery';
  const steps: [number, OrderStatus, OrderStatus, string][] = [
    [SIM_STEPS_MS.preparing, 'confirmed', 'preparing', 'Votre commande est en préparation'],
    delivery
      ? [SIM_STEPS_MS.shipping, 'preparing', 'out_for_delivery', 'Le livreur est en route']
      : [SIM_STEPS_MS.shipping, 'preparing', 'ready_for_pickup', 'Prête : présentez votre code en agence'],
    delivery
      ? [SIM_STEPS_MS.done, 'out_for_delivery', 'delivered', 'Livrée']
      : [SIM_STEPS_MS.done, 'ready_for_pickup', 'completed', 'Retirée en agence'],
  ];
  for (const [delay, from, to, note] of steps) {
    const at = new Date(t0 + delay);
    if (now < at) break;
    await db.transaction(async (txn) => {
      const tx = txn as unknown as Db;
      const final = to === 'delivered' || to === 'completed';
      // Payé à la livraison ou en agence : l'encaissement a lieu à la remise.
      const paidOnHandover = final && order.paymentStatus !== 'succeeded';
      const done = await transition(tx, order.id, [from], to, note, at, paidOnHandover ? { paymentStatus: 'succeeded', paidAt: at } : {});
      if (done && final) await closeReservations(tx, order.id, 'consume', at);
    });
  }
}

/**
 * Met une commande « à l'heure » : expiration du délai de paiement, puis avancement simulé
 * en développement. Les changements sont enregistrés (visibles aussi du back-office).
 */
export async function refreshOrder(db: Db, orderId: string, now = new Date()) {
  const load = async () => (await db.select().from(s.orders).where(eq(s.orders.id, orderId)))[0];
  let order = await load();
  if (!order) return;
  await expireUnpaid(db, order, now);
  if (env().ORDER_SIMULATION) {
    order = await load();
    if (order) await simulateProgress(db, order, now);
  }
}
