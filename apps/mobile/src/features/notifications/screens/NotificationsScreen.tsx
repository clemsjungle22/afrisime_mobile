import Ionicons from '@expo/vector-icons/Ionicons';
import type { AppNotification, NotificationKind, NotificationLink } from '@afrisime/shared';
import { router, useFocusEffect } from 'expo-router';
import { type ComponentProps, useCallback } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { EmptyState, ErrorState, PressableScale, Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { useMarkNotificationsRead, useNotifications } from '../hooks';

const ICONS: Record<NotificationKind, ComponentProps<typeof Ionicons>['name']> = {
  order: 'bag-handle-outline',
  carnet: 'wallet-outline',
  credit: 'cash-outline',
  profile: 'person-circle-outline',
};

const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lome' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Africa/Lome' });

/** « il y a 5 min », « 14:32 », « 3 oct. » selon l'ancienneté. */
function when(iso: string, now = Date.now()) {
  const at = new Date(iso);
  const minutes = Math.floor((now - at.getTime()) / 60_000);
  if (minutes < 1) return 'À l’instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (minutes < 24 * 60 && new Date(now).getDate() === at.getDate()) return timeFmt.format(at);
  return dayFmt.format(at);
}

/** Ouvre l'écran lié à une notification. */
export function openNotificationLink(link: NotificationLink | null) {
  if (!link) return;
  switch (link.type) {
    case 'order':
      return router.push({ pathname: '/orders/[orderId]', params: { orderId: link.orderId } });
    case 'carnet':
      return router.push({ pathname: '/carnets/[id]', params: { id: link.carnetId } });
    case 'credit':
      return router.push('/credit');
    case 'store_credit':
      return router.push('/avoir');
    case 'account':
      return router.navigate('/compte');
  }
}

/** Centre de notifications : les plus récentes d'abord ; tout est marqué lu en quittant l'écran. */
export function NotificationsScreen() {
  const theme = useTheme();
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = list.data?.unread ?? 0;

  // Relu à l'arrivée ; en partant, tout ce qui a été vu est marqué lu (la pastille disparaît).
  const { refetch } = list;
  const { mutate } = markRead;
  useFocusEffect(
    useCallback(() => {
      void refetch();
      return () => mutate(undefined);
    }, [refetch, mutate]),
  );

  if (list.isPending) {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={72} radius={theme.radius.lg} />
        ))}
      </View>
    );
  }
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;

  return (
    <FlatList
      data={list.data.items}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.sm, flexGrow: 1 }}
      refreshControl={
        <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
      }
      ListHeaderComponent={
        unread > 0 ? (
          <Text variant="caption" color="textMuted" style={{ marginBottom: theme.spacing.xs }}>
            {unread} nouvelle{unread > 1 ? 's' : ''} notification{unread > 1 ? 's' : ''}
          </Text>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon="notifications-outline"
          title="Aucune notification"
          description="Vous serez prévenu ici à chaque étape de vos commandes, de vos carnets et de votre crédit."
        />
      }
      renderItem={({ item }) => <NotificationRow notification={item} />}
    />
  );
}

function NotificationRow({ notification: n }: { notification: AppNotification }) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole={n.link ? 'button' : undefined}
      accessibilityLabel={`${n.read ? '' : 'Nouveau : '}${n.title}. ${n.body}`}
      disabled={!n.link}
      onPress={() => openNotificationLink(n.link)}
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: n.read ? theme.colors.surface : theme.colors.primarySoft,
        boxShadow: theme.shadows.sm,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: n.read ? theme.colors.primarySoft : theme.colors.surface,
        }}
      >
        <Ionicons name={ICONS[n.kind]} size={20} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            {n.title}
          </Text>
          <Text variant="caption" color="textMuted">
            {when(n.createdAt)}
          </Text>
        </View>
        <Text color="textMuted">{n.body}</Text>
      </View>
      {n.read ? null : <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: theme.colors.accent }} />}
    </PressableScale>
  );
}
