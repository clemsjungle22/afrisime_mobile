import { type AppNotification, NotificationList, type OrderStatus, formatFCFA } from '@afrisime/shared';
import type { NotificationsApi } from '@/features/notifications/api';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { type MockDb, loadDb, saveDb } from './db';
import { PAYMENT_CONFIRM_MS, materialize } from './orderServer';
import { simulate } from './simulate';

/**
 * Notifications du mode démo : déduites à la lecture de ce qui est arrivé (étapes des commandes,
 * cotisations, remboursements, crédit), comme celles que le serveur enregistre au fil de l'eau.
 */

type Draft = Omit<AppNotification, 'read'>;

const ORDER_MESSAGES: Partial<Record<OrderStatus, [string, (n: string) => string]>> = {
  confirmed: ['Paiement reçu', (n) => `Votre commande ${n} est confirmée.`],
  payment_failed: ['Paiement non abouti', (n) => `Le paiement de la commande ${n} n’a pas abouti. Vous pouvez réessayer.`],
  preparing: ['Commande en préparation', (n) => `Nous préparons votre commande ${n}.`],
  ready_for_pickup: ['Commande prête', (n) => `Votre commande ${n} vous attend en agence : présentez votre code de retrait.`],
  out_for_delivery: ['Livreur en route', (n) => `Votre commande ${n} arrive bientôt.`],
  delivered: ['Commande livrée', (n) => `Votre commande ${n} a été livrée. Merci !`],
  completed: ['Commande retirée', (n) => `Vous avez retiré votre commande ${n}. Merci !`],
  cancelled: ['Commande annulée', (n) => `Votre commande ${n} a été annulée : paiement non reçu à temps.`],
};

function drafts(db: MockDb, userId: string, now: number): Draft[] {
  const out: Draft[] = [];
  for (const stored of db.orders[userId] ?? []) {
    const order = materialize(stored, now);
    // La première étape est la création (le client le sait) ; sa propre annulation aussi.
    order.history.slice(1).forEach((e) => {
      const message = ORDER_MESSAGES[e.status];
      if (!message || e.note === 'Annulée à votre demande') return;
      out.push({
        id: `ntf_${order.id}_${e.status}`,
        kind: 'order',
        title: message[0],
        body: message[1](order.orderNumber),
        link: { type: 'order', orderId: order.id },
        createdAt: e.at,
      });
    });
  }
  for (const c of db.carnets[userId] ?? []) {
    let paid = 0;
    for (const x of c.contributions) {
      if (x.status !== 'succeeded') continue;
      paid += x.amount;
      const done = paid >= c.price;
      out.push({
        id: `ntf_${x.id}`,
        kind: 'carnet',
        title: done ? 'Carnet soldé !' : 'Cotisation reçue',
        body: done
          ? `${c.name} : tout est payé. Choisissez comment recevoir votre pack.`
          : `${formatFCFA(x.amount)} reçus sur ${c.name}. Reste ${formatFCFA(c.price - paid)}.`,
        link: { type: 'carnet', carnetId: c.id },
        createdAt: x.settledAt ?? x.createdAt,
      });
    }
  }
  const credit = db.credit?.[userId];
  if (credit?.account && credit.request?.status === 'approved') {
    out.push({
      id: `ntf_${credit.request.id}`,
      kind: 'credit',
      title: 'Crédit accordé !',
      body: `Vous pouvez acheter à crédit jusqu’à ${formatFCFA(credit.account.limit)}, remboursable en ${credit.account.termDays} jours, sans frais.`,
      link: { type: 'credit' },
      createdAt: credit.request.createdAt,
    });
  }
  for (const r of credit?.repayments ?? []) {
    if (r.status !== 'succeeded') continue;
    out.push({
      id: `ntf_${r.id}`,
      kind: 'credit',
      title: 'Remboursement reçu',
      body: `${formatFCFA(r.amount)} reçus sur votre crédit.`,
      link: { type: 'credit' },
      createdAt: new Date(Date.parse(r.createdAt) + PAYMENT_CONFIRM_MS).toISOString(),
    });
  }
  return out.filter((n) => Date.parse(n.createdAt) <= now).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function mockNotificationList(db: MockDb, userId: string, now: number): NotificationList {
  const read = new Set(db.notificationsRead?.[userId] ?? []);
  const items = drafts(db, userId, now).map((n) => ({ ...n, read: read.has(n.id) }));
  return { items, unread: items.filter((n) => !n.read).length };
}

export const mockNotificationsApi: NotificationsApi = {
  list(signal) {
    return withRetry(
      () =>
        withAuth((token) =>
          simulate(NotificationList, async () => {
            const user = await requireUser(token);
            return mockNotificationList(await loadDb(), user.id, Date.now());
          }),
        ),
      { canRetry: true, signal },
    );
  },
  markRead(ids) {
    return withRetry(() =>
      withAuth((token) =>
        simulate(NotificationList, async () => {
          const user = await requireUser(token);
          const db = await loadDb();
          const now = Date.now();
          const all = drafts(db, user.id, now).map((n) => n.id);
          const read = new Set([...(db.notificationsRead?.[user.id] ?? []), ...(ids ?? all)]);
          await saveDb({ ...db, notificationsRead: { ...db.notificationsRead, [user.id]: [...read].filter((id) => all.includes(id)) } });
          return mockNotificationList(await loadDb(), user.id, now);
        }),
      ),
      // Marquer lu est sans risque à rejouer.
      { canRetry: true },
    );
  },
};
