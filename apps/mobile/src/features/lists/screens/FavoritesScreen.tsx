import type { ProductSummary } from '@afrisime/shared';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { ProductCard } from '@/features/catalog/components/ProductCard';
import { openProduct } from '@/lib/links';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { useTheme } from '@/theme';
import { useFavorites } from '../hooks';

/** Produits favoris, aux prix et disponibilités du moment. */
export function FavoritesScreen() {
  const theme = useTheme();
  const favorites = useFavorites();
  useRefetchOnFocus(favorites.refetch);
  const onPress = useCallback((p: ProductSummary) => openProduct(p.slug), []);
  const gutter = theme.spacing.xs + 2;

  if (favorites.isPending) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: theme.spacing.md, gap: theme.spacing.md }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: '47%' }}>
            <Skeleton height={230} radius={theme.radius.lg} />
          </View>
        ))}
      </View>
    );
  }
  if (favorites.isError) return <ErrorState error={favorites.error} onRetry={() => void favorites.refetch()} />;

  return (
    <FlatList
      data={favorites.data.items}
      keyExtractor={(p) => p.id}
      numColumns={2}
      contentContainerStyle={{ padding: theme.spacing.md - gutter, paddingBottom: theme.spacing.xxl, flexGrow: 1 }}
      renderItem={({ item }) => (
        <View style={{ flex: 1 / 2, padding: gutter }}>
          <ProductCard product={item} onPress={onPress} />
        </View>
      )}
      refreshControl={
        <RefreshControl
          refreshing={favorites.isRefetching}
          onRefresh={() => void favorites.refetch()}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
      ListEmptyComponent={
        <EmptyState
          icon="heart-outline"
          title="Aucun favori pour l’instant"
          description="Touchez le cœur d’un produit pour le retrouver ici."
          actionLabel="Voir la boutique"
          onAction={() => router.navigate('/boutique')}
        />
      }
    />
  );
}
