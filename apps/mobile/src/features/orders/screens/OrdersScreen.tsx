import type { OrderSummary } from '@afrisime/shared';
import { FlashList } from '@shopify/flash-list';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, EmptyState, ErrorState, OfflineBanner, Screen, Segmented, Skeleton, Text } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { FLOATING_TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { useTheme } from '@/theme';
import type { OrderFilter } from '../api';
import { OrderCard } from '../components/OrderCard';
import { useOrders } from '../hooks';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';

export function OrdersScreen() {
  const theme = useTheme();
  const status = useSession((s) => s.status);
  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
        <Text variant="title" accessibilityRole="header">
          Commandes
        </Text>
      </View>
      {status === 'authenticated' ? (
        <OrdersList />
      ) : (
        <EmptyState
          icon="receipt-outline"
          art="orders"
          title="Connectez-vous pour voir vos commandes"
          description="Suivez vos livraisons, vos paiements et commandez à nouveau en un geste."
          actionLabel="Se connecter"
          onAction={() => router.push('/login')}
        />
      )}
    </Screen>
  );
}

function OrdersList() {
  const theme = useTheme();
  const [filter, setFilter] = useState<OrderFilter>('active');
  const orders = useOrders(filter);
  useRefetchOnFocus(orders.refetch);

  // Rafraîchit en revenant sur l'onglet (statuts qui évoluent), sauf au 1er affichage.
  const focused = useRef(false);
  const { refetch } = orders;
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void refetch();
      focused.current = true;
    }, [refetch]),
  );

  const onPress = useCallback(
    (o: OrderSummary) => router.push({ pathname: '/orders/[orderId]', params: { orderId: o.id } }),
    [],
  );
  const renderItem = useCallback(
    ({ item }: { item: OrderSummary }) => (
      <View style={{ paddingBottom: theme.spacing.md }}>
        <OrderCard order={item} onPress={onPress} />
      </View>
    ),
    [onPress, theme.spacing.md],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
        <Segmented
          accessibilityLabel="Commandes"
          options={[
            { value: 'active', label: 'En cours' },
            { value: 'history', label: 'Historique' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>
      <OfflineBanner updatedAt={orders.dataUpdatedAt} />
      {orders.data ? (
        <FlashList
          data={orders.items}
          renderItem={renderItem}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: FLOATING_TAB_BAR_SPACE }}
          refreshing={orders.isRefetching && !orders.isFetchingNextPage}
          onRefresh={() => void orders.refetch()}
          onEndReached={() => {
            if (orders.hasNextPage && !orders.isFetchingNextPage) void orders.fetchNextPage();
          }}
          ListFooterComponent={
            orders.isFetchingNextPage ? <ActivityIndicator color={theme.colors.primary} style={{ margin: theme.spacing.lg }} /> : null
          }
          ListEmptyComponent={
            filter === 'active' ? (
              <EmptyState
                icon="bag-handle-outline"
                art="orders"
                title="Aucune commande en cours"
                description="Vos commandes apparaîtront ici dès leur validation."
                actionLabel="Découvrir la boutique"
                onAction={() => router.navigate('/boutique')}
              />
            ) : (
              <EmptyState icon="time-outline" title="Pas encore d’historique" description="Vos commandes livrées ou annulées apparaîtront ici." />
            )
          }
        />
      ) : orders.isError ? (
        <ErrorState error={orders.error} onRetry={() => void orders.refetch()} />
      ) : (
        <View style={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }} accessibilityLabel="Chargement des commandes">
          <Skeleton height={120} radius={theme.radius.lg} />
          <Skeleton height={120} radius={theme.radius.lg} />
        </View>
      )}
      {orders.isError && orders.data ? (
        <Button label="Réessayer" variant="ghost" onPress={() => void orders.refetch()} />
      ) : null}
    </View>
  );
}
