import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, EmptyState, Screen, Text } from '@/components/ui';
import { CART_NEXT_SPACE, FLOATING_TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { useTheme } from '@/theme';
import { FilteredProducts } from '../components/FilteredProducts';
import { SearchEntry } from '../components/SearchEntry';
import { countActiveFilters } from '../filters';
import { useCategories } from '../hooks';
import { useFilterParams } from '../useFilterParams';

export function ShopScreen() {
  const theme = useTheme();
  const { filters, setFilters } = useFilterParams();
  const categories = useCategories();
  const currentCategory = categories.data?.find((c) => c.slug === filters.category);

  // Changer de rayon repart de zéro (une marque d'un rayon n'existe pas forcément dans l'autre) ; le tri est conservé.
  const selectCategory = (slug: string | undefined) => {
    setFilters({
      ...(slug ? { category: slug } : {}),
      ...(filters.sort ? { sort: filters.sort } : {}),
    });
  };

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.md }}>
        <Text variant="title" accessibilityRole="header">
          Boutique
        </Text>
        <SearchEntry onPress={() => router.push('/search')} />
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
        <Chip label="Tous" selected={!filters.category} onPress={() => selectCategory(undefined)} />
        {(categories.data ?? []).map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            selected={c.slug === filters.category}
            onPress={() => selectCategory(c.slug)}
          />
        ))}
      </ScrollView>

      <FilteredProducts
        filters={filters}
        onChange={setFilters}
        hide={['category']}
        bottomSpace={FLOATING_TAB_BAR_SPACE + CART_NEXT_SPACE}
        header={() =>
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
        empty={() =>
          countActiveFilters(filters, ['category']) > 0 ? (
            <EmptyState
              icon="options-outline"
              title="Aucun produit avec ces filtres"
              description="Essayez d'élargir votre sélection."
              actionLabel="Effacer les filtres"
              onAction={() => setFilters(filters.category ? { category: filters.category } : {})}
            />
          ) : (
            <EmptyState
              icon="basket-outline"
              art="search"
              title="Aucun produit dans ce rayon"
              description="Revenez bientôt ou parcourez les autres rayons."
              actionLabel="Voir tous les produits"
              onAction={() => selectCategory(undefined)}
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexGrow: 0,
  },
});
