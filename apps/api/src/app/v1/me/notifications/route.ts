import { NotificationList } from '@afrisime/shared';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { listNotifications } from '@/server/notifications/service';

/** Notifications du client, les plus récentes d'abord, avec le nombre de non lues. */
export const GET = route({ auth: 'required', response: NotificationList }, ({ auth }) =>
  listNotifications(getDb(), auth.customer.id),
);
