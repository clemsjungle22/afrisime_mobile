import type { ProductSummary } from '@afrisime/shared';
import { FlashList } from '@shopify/flash-list';
import { useCallback, type ReactElement } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ErrorState, Text } from '@/components/ui';
import { openProduct } from '@/lib/links';
import { useTheme } from '@/theme';
import type { useProducts } from '../hooks';
import { ProductCard, ProductCardSkeleton } from './ProductCard';

type Props = {
  products: ReturnType<typeof useProducts>;
  header?: ReactElement | null;
  empty: ReactElement;
};

/** Grille 2 colonnes paginée, avec tous les états (chargement, erreur, vide, page suivante). */
export function ProductGrid({ products, header, empty }: Props) {
  const theme = useTheme();
  const onPressProduct = useCallback((p: ProductSummary) => openProduct(p.slug), []);
  const gutter = theme.spacing.xs + 2;

  const renderItem = useCallback(
    ({ item }: { item: ProductSummary }) => (
      <View style={{ flex: 1, padding: gutter }}>
        <ProductCard product={item} onPress={onPressProduct} />
      </View>
    ),
    [onPressProduct, gutter],
  );

  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = products;
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  if (!products.data) {
    if (products.isError) {
      return <ErrorState error={products.error} onRetry={() => void products.refetch()} />;
    }
    return (
      <View
        accessibilityLabel="Chargement des produits"
        style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.md }}
      >
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: '50%', padding: gutter }}>
            <ProductCardSkeleton />
          </View>
        ))}
      </View>
    );
  }

  return (
    <FlashList
      data={products.items}
      numColumns={2}
      renderItem={renderItem}
      keyExtractor={(p) => p.id}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      refreshing={products.isRefetching && !products.isFetchingNextPage}
      onRefresh={() => void products.refetch()}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={
        products.isFetchingNextPage ? (
          <ActivityIndicator color={theme.colors.primary} style={{ margin: theme.spacing.lg }} />
        ) : products.isFetchNextPageError ? (
          <Text
            color="error"
            align="center"
            style={{ margin: theme.spacing.lg }}
            onPress={() => void products.fetchNextPage()}
            accessibilityRole="button"
          >
            Chargement interrompu. Touchez pour réessayer.
          </Text>
        ) : null
      }
    />
  );
}
