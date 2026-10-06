import type { ProductSummary } from '@afrisime/shared';
import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { Chip, EmptyState, ErrorState, OfflineBanner, Screen, Text } from '@/components/ui';
import { comingSoon } from '@/lib/comingSoon';
import { openProduct } from '@/lib/links';
import { useTheme } from '@/theme';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { SearchEntry } from '../components/SearchEntry';
import { useCategories, useProducts } from '../hooks';

/** Paramètre de route validé : un slug de rayon ou rien. */
const ShopParams = z.object({
  category: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional()
    .catch(undefined),
});

const PAGE_SIZE = 20;

export function ShopScreen() {
  const theme = useTheme();
  const { category } = ShopParams.parse(useLocalSearchParams());
  const categories = useCategories();
  const products = useProducts({ category, limit: PAGE_SIZE });

  const selectCategory = useCallback((slug: string | undefined) => {
    router.setParams({ category: slug });
  }, []);

  const onPressProduct = useCallback((p: ProductSummary) => openProduct(p.slug), []);

  const renderItem = useCallback(
    ({ item }: { item: ProductSummary }) => (
      <View style={{ flex: 1, padding: theme.spacing.xs + 2 }}>
        <ProductCard product={item} onPress={onPressProduct} />
      </View>
    ),
    [onPressProduct, theme.spacing.xs],
  );

  const onEndReached = useCallback(() => {
    if (products.hasNextPage && !products.isFetchingNextPage && !products.isError) {
      void products.fetchNextPage();
    }
  }, [products]);

  const currentCategory = categories.data?.find((c) => c.slug === category);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.md }}>
        <Text variant="title" accessibilityRole="header">
          Boutique
        </Text>
        <SearchEntry onPress={() => comingSoon('La recherche')} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        style={styles.chips}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        <Chip label="Tous" selected={!category} onPress={() => selectCategory(undefined)} />
        {(categories.data ?? []).map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={c.slug === category}
            onPress={() => selectCategory(c.slug)}
          />
        ))}
      </ScrollView>

      <OfflineBanner updatedAt={products.dataUpdatedAt} />

      {products.data ? (
        <FlashList
          data={products.items}
          numColumns={2}
          renderItem={renderItem}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          refreshing={products.isRefetching && !products.isFetchingNextPage}
          onRefresh={() => void products.refetch()}
          ListHeaderComponent={
            currentCategory?.description ? (
              <Text
                variant="caption"
                color="textMuted"
                style={{ paddingHorizontal: theme.spacing.xs + 2, paddingBottom: theme.spacing.sm }}
              >
                {currentCategory.description}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="basket-outline"
              title="Aucun produit dans ce rayon"
              description="Revenez bientôt ou parcourez les autres rayons."
              actionLabel="Voir tous les produits"
              onAction={() => selectCategory(undefined)}
            />
          }
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
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : (
        <ShopSkeleton />
      )}
    </Screen>
  );
}

function ShopSkeleton() {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel="Chargement des produits"
      style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: theme.spacing.md }}
    >
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: '50%', padding: theme.spacing.xs + 2 }}>
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexGrow: 0,
  },
});
