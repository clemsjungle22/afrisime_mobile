import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA, type Pack } from '@afrisime/shared';
import { router } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import { EmptyState, ErrorState, PressableScale, Skeleton, Text } from '@/components/ui';
import { ProductThumb } from '@/features/catalog/components/ProductThumb';
import { useTheme } from '@/theme';
import { usePacks } from '../hooks';

/** Packs Famille : cotisez chaque jour, recevez vos produits à l'échéance. */
export function PacksScreen() {
  const theme = useTheme();
  const packs = usePacks();

  if (packs.isPending) {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} height={140} radius={theme.radius.lg} />
        ))}
      </View>
    );
  }
  if (packs.isError) return <ErrorState error={packs.error} onRetry={() => void packs.refetch()} />;

  return (
    <FlatList
      data={packs.data.items}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, flexGrow: 1 }}
      ListHeaderComponent={
        <Text color="textMuted" style={{ marginBottom: theme.spacing.xs }}>
          Cotisez un peu chaque jour, par Mobile Money ou en agence. À l’échéance, vous recevez tous les produits du
          pack.
        </Text>
      }
      renderItem={({ item }) => <PackCard pack={item} />}
      refreshControl={
        <RefreshControl
          refreshing={packs.isRefetching}
          onRefresh={() => void packs.refetch()}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
      ListEmptyComponent={<EmptyState icon="gift-outline" title="Aucun pack pour le moment" description="Revenez bientôt." />}
    />
  );
}

export function savingOf(pack: Pick<Pack, 'price' | 'catalogValue'>): number {
  return pack.catalogValue !== null && pack.catalogValue > pack.price ? pack.catalogValue - pack.price : 0;
}

function PackCard({ pack }: { pack: Pack }) {
  const theme = useTheme();
  const saving = savingOf(pack);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${pack.name}, ${formatFCFA(pack.price)} en ${pack.durationDays} jours, ${formatFCFA(pack.dailyAmount)} par jour`}
      onPress={() => router.push({ pathname: '/packs/[id]', params: { id: pack.id } })}
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        boxShadow: theme.shadows.sm,
      }}
    >
      <View style={{ width: 96, height: 96, borderRadius: theme.radius.md, overflow: 'hidden' }}>
        <ProductThumb name={pack.name} imageUrl={pack.imageUrl} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong">{pack.name}</Text>
        <Text variant="caption" color="textMuted">
          {pack.items.length} produits · {pack.durationDays} jours
        </Text>
        <Text variant="price" color="primary">
          {formatFCFA(pack.dailyAmount)} / jour
        </Text>
        <Text variant="caption" color="textMuted">
          Total {formatFCFA(pack.price)}
          {saving > 0 ? ` · ${formatFCFA(saving)} d’économie` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} style={{ alignSelf: 'center' }} />
    </PressableScale>
  );
}
