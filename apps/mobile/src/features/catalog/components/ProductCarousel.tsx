import type { ProductSummary } from '@afrisime/shared';
import { FlashList } from '@shopify/flash-list';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { ProductCard } from './ProductCard';

type Props = {
  title: string;
  products: ProductSummary[];
  onPressProduct: (product: ProductSummary) => void;
  onSeeAll?: () => void;
  /** Élément affiché à droite du titre (compte à rebours…). */
  accessory?: ReactNode;
};

const CARD_WIDTH = 164;

/** Section horizontale de produits (accueil, produits associés). */
export function ProductCarousel({ title, products, onPressProduct, onSeeAll, accessory }: Props) {
  const theme = useTheme();
  const renderItem = useCallback(
    ({ item }: { item: ProductSummary }) => (
      <View style={{ width: CARD_WIDTH, marginRight: theme.spacing.md }}>
        <ProductCard product={item} onPress={onPressProduct} />
      </View>
    ),
    [onPressProduct, theme.spacing.md],
  );

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm }]}>
        <View style={[styles.titleRow, { gap: theme.spacing.sm }]}>
          <Text variant="subtitle" accessibilityRole="header">
            {title}
          </Text>
          {accessory}
        </View>
        {onSeeAll ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Voir tout : ${title}`}
            onPress={onSeeAll}
            hitSlop={12}
          >
            <Text variant="label" color="primary">
              Voir tout
            </Text>
          </Pressable>
        ) : null}
      </View>
      <FlashList
        horizontal
        data={products}
        renderItem={renderItem}
        keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});
