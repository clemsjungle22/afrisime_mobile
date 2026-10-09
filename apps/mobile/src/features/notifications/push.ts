import { NotificationLink, type PushTokenBody } from '@afrisime/shared';
import { useQueryClient } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { apiConfig } from '@/api/config';
import { useSession } from '@/features/auth/session';
import { registerPushToken, unregisterPushToken } from './api';
import { notificationsKeys } from './hooks';
import { openNotificationLink } from './screens/NotificationsScreen';

/**
 * Notifications push Android (Firebase) : le téléphone s'inscrit une fois connecté ; toucher une
 * notification ouvre l'écran concerné. Rien en mode démo ni dans Expo Go (qui ne reçoit pas les push).
 */

const supported = Platform.OS === 'android' && !apiConfig.mock && !isRunningInExpoGo();

/** Même canal que celui demandé par le serveur (« default »). */
const CHANNEL = 'default';

let registered: PushTokenBody | null = null;

if (supported) {
  // App ouverte : la notification s'affiche aussi en bannière.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function register(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Commandes, carnets et crédit',
    importance: Notifications.AndroidImportance.HIGH,
  });
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return;
  const { data } = await Notifications.getDevicePushTokenAsync();
  const body: PushTokenBody = { token: String(data), platform: 'android' };
  await registerPushToken(body);
  registered = body;
}

/** Désinscription à la déconnexion (au mieux : sans réseau, le serveur retirera le jeton plus tard). */
export async function unregisterPush(): Promise<void> {
  const body = registered;
  registered = null;
  if (body) await unregisterPushToken(body).catch(() => undefined);
}

function linkOf(response: Notifications.NotificationResponse | null) {
  const raw = response?.notification.request.content.data?.link;
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parsed = NotificationLink.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Inscription, rafraîchissement de la cloche et ouverture de l'écran lié (sans rendu). */
export function PushSync() {
  const authenticated = useSession((s) => s.status === 'authenticated');
  const client = useQueryClient();
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!supported || !authenticated) return;
    register().catch(() => undefined);
  }, [authenticated]);

  useEffect(() => {
    if (!supported) return;
    const sub = Notifications.addNotificationReceivedListener(() => {
      void client.invalidateQueries({ queryKey: notificationsKeys.all });
    });
    return () => sub.remove();
  }, [client]);

  // Notification touchée (app ouverte, en arrière-plan ou fermée) : écran concerné.
  useEffect(() => {
    if (!supported || !authenticated) return;
    const link = linkOf(lastResponse ?? null);
    if (!link) return;
    void client.invalidateQueries({ queryKey: notificationsKeys.all });
    openNotificationLink(link);
    void Notifications.clearLastNotificationResponseAsync();
  }, [lastResponse, authenticated, client]);

  return null;
}
