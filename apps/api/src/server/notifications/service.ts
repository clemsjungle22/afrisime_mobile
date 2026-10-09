import {
  type AppNotification,
  MAX_NOTIFICATIONS,
  type NotificationKind,
  type NotificationLink,
  type NotificationList,
  type OrderStatus,
} from '@afrisime/shared';
import { and, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { newId } from '../ids';
import { schedulePush } from './push';

/**
 * Centre de notifications du client : une ligne par événement qui le concerne, écrite dans la même
 * transaction que l'événement (jamais de notification pour un changement annulé).
 */

export type NewNotification = {
  kind: NotificationKind;
  title: string;
  body: string;
  link?: NotificationLink | null;
};

export async function notify(tx: Db, customerId: string, n: NewNotification, at = new Date()) {
  await tx.insert(s.notifications).values({
    id: newId('ntf'),
    customerId,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link ?? null,
    createdAt: at,
  });
  schedulePush();
}

function toNotification(r: typeof s.notifications.$inferSelect): AppNotification {
  return {
    id: r.id,
    kind: r.kind as NotificationKind,
    title: r.title,
    body: r.body,
    link: (r.link as NotificationLink | null) ?? null,
    read: r.readAt !== null,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listNotifications(db: Db, customerId: string): Promise<NotificationList> {
  const rows = await db
    .select()
    .from(s.notifications)
    .where(eq(s.notifications.customerId, customerId))
    .orderBy(desc(s.notifications.createdAt), desc(s.notifications.id))
    .limit(MAX_NOTIFICATIONS + 1);
  // Au-delà du maximum, les plus anciennes sont effacées.
  const oldest = rows[MAX_NOTIFICATIONS - 1];
  if (rows.length > MAX_NOTIFICATIONS && oldest) {
    await db
      .delete(s.notifications)
      .where(
        and(
          eq(s.notifications.customerId, customerId),
          lt(s.notifications.createdAt, oldest.createdAt),
        ),
      );
  }
  const items = rows.slice(0, MAX_NOTIFICATIONS).map(toNotification);
  const [unread] = await db
    .select({ n: count() })
    .from(s.notifications)
    .where(and(eq(s.notifications.customerId, customerId), isNull(s.notifications.readAt)));
  return { items, unread: unread?.n ?? 0 };
}

export async function markNotificationsRead(
  db: Db,
  customerId: string,
  ids: string[] | undefined,
  now = new Date(),
) {
  await db
    .update(s.notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(s.notifications.customerId, customerId),
        isNull(s.notifications.readAt),
        ids ? inArray(s.notifications.id, ids.length ? ids : ['']) : sql`true`,
      ),
    );
  return listNotifications(db, customerId);
}

// ─── Messages ────────────────────────────────────────────────────────────────

/** Notification d'un changement d'étape de commande (null : rien à signaler). */
export function orderNotification(
  to: OrderStatus,
  order: { id: string; orderNumber: string; fulfillment: string },
  actor: string,
): NewNotification | null {
  const link: NotificationLink = { type: 'order', orderId: order.id };
  const n = order.orderNumber;
  switch (to) {
    case 'confirmed':
      return {
        kind: 'order',
        title: 'Paiement reçu',
        body: `Votre commande ${n} est confirmée.`,
        link,
      };
    case 'payment_failed':
      return {
        kind: 'order',
        title: 'Paiement non abouti',
        body: `Le paiement de la commande ${n} n’a pas abouti. Vous pouvez réessayer.`,
        link,
      };
    case 'preparing':
      return {
        kind: 'order',
        title: 'Commande en préparation',
        body: `Nous préparons votre commande ${n}.`,
        link,
      };
    case 'ready_for_pickup':
      return {
        kind: 'order',
        title: 'Commande prête',
        body: `Votre commande ${n} vous attend en agence : présentez votre code de retrait.`,
        link,
      };
    case 'out_for_delivery':
      return {
        kind: 'order',
        title: 'Livreur en route',
        body: `Votre commande ${n} arrive bientôt.`,
        link,
      };
    case 'delivered':
      return {
        kind: 'order',
        title: 'Commande livrée',
        body: `Votre commande ${n} a été livrée. Merci !`,
        link,
      };
    case 'completed':
      return {
        kind: 'order',
        title: 'Commande retirée',
        body: `Vous avez retiré votre commande ${n}. Merci !`,
        link,
      };
    case 'cancelled':
      // Annulée par le client lui-même : il le sait déjà.
      if (actor === 'customer') return null;
      return {
        kind: 'order',
        title: 'Commande annulée',
        body: actor.startsWith('admin:')
          ? `Votre commande ${n} a été annulée par AfriSime.`
          : `Votre commande ${n} a été annulée : paiement non reçu à temps.`,
        link,
      };
    case 'refunded':
      return {
        kind: 'order',
        title: 'Remboursement en cours',
        body: `Le montant de la commande ${n} vous est remboursé.`,
        link,
      };
    default:
      return null;
  }
}
