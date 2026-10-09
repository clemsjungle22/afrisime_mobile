import { MarkNotificationsReadBody, NotificationList } from '@afrisime/shared';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { markNotificationsRead } from '@/server/notifications/service';

/** Marque lues les notifications indiquées, ou toutes. */
export const POST = route(
  { auth: 'required', body: MarkNotificationsReadBody, response: NotificationList },
  ({ auth, body }) => markNotificationsRead(getDb(), auth.customer.id, body.ids),
);
