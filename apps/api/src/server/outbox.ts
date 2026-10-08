import type { Db } from './db/client';
import * as s from './db/schema';

export type OutboxEvent = 'order.created' | 'order.paid' | 'order.cancelled' | 'order.refunded' | 'order.status_changed';

/**
 * Événement métier écrit dans la MÊME transaction que le changement : il ne peut pas être perdu
 * ni publié pour un changement annulé. Un worker le transmettra plus tard (AfriGes, notifications).
 */
export async function emit(tx: Db, eventType: OutboxEvent, orderId: string, payload: Record<string, unknown>) {
  await tx.insert(s.outbox).values({ eventType, aggregate: 'order', aggregateId: orderId, payload });
}
