import { and, inArray, isNotNull, lte } from 'drizzle-orm';
import { refreshPendingContributions } from './carnets/service';
import type { Db } from './db/client';
import * as s from './db/schema';
import { env } from './env';
import { AWAITING_PAYMENT, IN_PROGRESS, refreshOrder } from './orders/state';
import { pendingPaymentIds, refreshPayment } from './payments/service';

/**
 * Tâche périodique (chaque minute) : rattrape les paiements dont le webhook n'est pas arrivé,
 * annule les commandes non payées à temps (stock libéré) et, en développement, fait avancer les commandes.
 */
export async function tick(db: Db, now = new Date()) {
  const payments = await pendingPaymentIds(db, now);
  for (const id of payments) await refreshPayment(db, id, now);
  const contributions = await refreshPendingContributions(db, now);

  const expired = await db
    .select({ id: s.orders.id })
    .from(s.orders)
    .where(
      and(
        inArray(s.orders.status, AWAITING_PAYMENT),
        isNotNull(s.orders.paymentDeadline),
        lte(s.orders.paymentDeadline, now),
      ),
    );
  for (const o of expired) await refreshOrder(db, o.id, now);

  let advanced = 0;
  if (env().ORDER_SIMULATION) {
    const open = await db.select({ id: s.orders.id }).from(s.orders).where(inArray(s.orders.status, IN_PROGRESS));
    for (const o of open) await refreshOrder(db, o.id, now);
    advanced = open.length;
  }
  return {
    paymentsChecked: payments.length,
    contributionsChecked: contributions, ordersExpired: expired.length, ordersAdvanced: advanced };
}
