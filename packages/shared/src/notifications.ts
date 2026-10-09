import { z } from 'zod';

/**
 * Notifications du client (/v1/me/notifications) : créées par le serveur à chaque événement qui le
 * concerne (commande, carnet, crédit, profil). Envoyées aussi en push quand le téléphone est inscrit.
 */

export const NotificationKind = z.enum(['order', 'carnet', 'credit', 'profile']);
export type NotificationKind = z.infer<typeof NotificationKind>;

/** Écran à ouvrir quand on touche la notification. */
export const NotificationLink = z.discriminatedUnion('type', [
  z.object({ type: z.literal('order'), orderId: z.string() }),
  z.object({ type: z.literal('carnet'), carnetId: z.string() }),
  z.object({ type: z.literal('credit') }),
  z.object({ type: z.literal('store_credit') }),
  z.object({ type: z.literal('account') }),
]);
export type NotificationLink = z.infer<typeof NotificationLink>;

export const AppNotification = z.object({
  id: z.string(),
  kind: NotificationKind,
  title: z.string(),
  body: z.string(),
  link: NotificationLink.nullable(),
  read: z.boolean(),
  createdAt: z.string().datetime(),
});
export type AppNotification = z.infer<typeof AppNotification>;

/** GET /v1/me/notifications : les plus récentes d'abord. */
export const NotificationList = z.object({
  items: z.array(AppNotification),
  unread: z.number().int().nonnegative(),
});
export type NotificationList = z.infer<typeof NotificationList>;

/** POST /v1/me/notifications/read : marque lues celles-ci, ou toutes si `ids` est absent. */
export const MarkNotificationsReadBody = z.object({ ids: z.array(z.string()).max(200).optional() });
export type MarkNotificationsReadBody = z.infer<typeof MarkNotificationsReadBody>;

/** Nombre de notifications gardées par client (les plus anciennes sont effacées). */
export const MAX_NOTIFICATIONS = 100;
