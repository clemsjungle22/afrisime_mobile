import { MarkNotificationsReadBody, NotificationList } from '@afrisime/shared';
import { request } from '@/api/client';
import { apiConfig } from '@/api/config';
import { mockNotificationsApi } from '@/api/mock/notifications';

/** Centre de notifications du client connecté. */
export type NotificationsApi = {
  list(signal?: AbortSignal): Promise<NotificationList>;
  /** Marque lues celles-ci, ou toutes si `ids` est absent. */
  markRead(ids?: string[]): Promise<NotificationList>;
};

const httpNotificationsApi: NotificationsApi = {
  list(signal) {
    return request('/v1/me/notifications', { schema: NotificationList, signal });
  },
  markRead(ids) {
    return request('/v1/me/notifications/read', {
      method: 'POST',
      body: MarkNotificationsReadBody.parse({ ids }),
      schema: NotificationList,
    });
  },
};

export const notificationsApi: NotificationsApi = apiConfig.mock ? mockNotificationsApi : httpNotificationsApi;
