import { type Carnet, CARNET_STATUS_LABELS, formatFCFA } from '@afrisime/shared';
import { router } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import { Badge, type BadgeTone, Button, EmptyState, ErrorState, PressableScale, Skeleton, Text } from '@/components/ui';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { useTheme } from '@/theme';
import { ProgressBar } from '../components/ProgressBar';
import { useCarnets } from '../hooks';

export const STATUS_TONES: Record<Carnet['status'], BadgeTone> = {
  active: 'info',
  completed: 'success',
  delivered: 'neutral',
  abandoned: 'neutral',
};

/** Carnets du client : progression de chacun, en cours d'abord. */
export function CarnetsScreen() {
  const theme = useTheme();
  const carnets = useCarnets();
  useRefetchOnFocus(carnets.refetch);

  if (carnets.isPending) {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={120} radius={theme.radius.lg} />
        ))}
      </View>
    );
  }
  if (carnets.isError) return <ErrorState error={carnets.error} onRetry={() => void carnets.refetch()} />;

  return (
    <FlatList
      data={carnets.data.items}
      keyExtractor={(c) => c.id}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, flexGrow: 1 }}
      renderItem={({ item }) => <CarnetCard carnet={item} />}
      refreshControl={
        <RefreshControl
          refreshing={carnets.isRefetching}
          onRefresh={() => void carnets.refetch()}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
      ListEmptyComponent={
        <EmptyState
          icon="wallet-outline"
          title="Aucun carnet pour l’instant"
          description="Choisissez un Pack Famille, cotisez un peu chaque jour et recevez vos produits à l’échéance."
          actionLabel="Découvrir les packs"
          onAction={() => router.push('/packs')}
        />
      }
      ListFooterComponent={
        carnets.data.items.length > 0 ? (
          <Button label="Voir les Packs Famille" variant="ghost" onPress={() => router.push('/packs')} />
        ) : null
      }
    />
  );
}

function CarnetCard({ carnet: c }: { carnet: Carnet }) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${c.name}, ${formatFCFA(c.paid)} versés sur ${formatFCFA(c.price)}, ${CARNET_STATUS_LABELS[c.status]}`}
      onPress={() => router.push({ pathname: '/carnets/[id]', params: { id: c.id } })}
      style={{ gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, boxShadow: theme.shadows.sm }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {c.name}
        </Text>
        <Badge label={c.status === 'active' && c.daysLate > 0 ? `${c.daysLate} j de retard` : CARNET_STATUS_LABELS[c.status]} tone={c.status === 'active' && c.daysLate > 0 ? 'warning' : STATUS_TONES[c.status]} />
      </View>
      <ProgressBar value={c.paid} total={c.price} late={c.daysLate > 0} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="textMuted">
          {formatFCFA(c.paid)} versés sur {formatFCFA(c.price)}
        </Text>
        {c.status === 'active' ? (
          <Text variant="caption" color="textMuted">
            Reste {formatFCFA(c.remaining)}
          </Text>
        ) : null}
      </View>
      {c.pendingContribution ? (
        <Text variant="caption" color="info">
          Cotisation de {formatFCFA(c.pendingContribution.amount)} en attente de confirmation
        </Text>
      ) : null}
    </PressableScale>
  );
}
