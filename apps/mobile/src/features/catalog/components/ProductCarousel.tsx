import Ionicons from '@expo/vector-icons/Ionicons';
import type { ProductSummary } from '@afrisime/shared';
import { FlashList } from '@shopify/flash-list';
import { useCallback, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { palette, useTheme } from '@/theme';
import { ProductCard } from './ProductCard';

type Props = {
  title: string;
  /** Petite ligne au-dessus du titre (« À NE PAS MANQUER »). */
  overline?: string;
  products: ProductSummary[];
  onPressProduct: (product: ProductSummary) => void;
  onSeeAll?: () => void;
  /** Élément affiché sous le titre (compte à rebours…). */
  accessory?: ReactNode;
  /** dark : section posée sur un fond sombre (ventes flash). */
  tone?: 'default' | 'dark';
};

const CARD_WIDTH = 172;

/** Section horizontale de produits (accueil, produits associés). */
export function ProductCarousel({ title, overline, products, onPressProduct, onSeeAll, accessory, tone = 'default' }: Props) {
  const theme = useTheme();
  const dark = tone === 'dark';
  const renderItem = useCallback(
    ({ item }: { item: ProductSummary }) => (
      <View style={{ width: CARD_WIDTH, marginRight: theme.spacing.md, paddingVertical: 6 }}>
        <ProductCard product={item} onPress={onPressProduct} />
      </View>
    ),
    [onPressProduct, theme.spacing.md],
  );

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm }]}>
        <View style={{ flex: 1, gap: 4 }}>
          {overline ? (
            <Text variant="overline" style={{ color: dark ? palette.accent500 : theme.colors.accent }}>
              {overline}
            </Text>
          ) : null}
          <Text variant="title" accessibilityRole="header" style={dark ? { color: palette.white } : undefined}>
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
            style={({ pressed }) => [
              styles.seeAll,
              {
                borderRadius: theme.radius.pill,
                backgroundColor: dark ? 'rgba(255,255,255,0.12)' : theme.colors.surface,
                opacity: pressed ? 0.7 : 1,
                boxShadow: dark ? undefined : theme.shadows.sm,
              },
            ]}
          >
            <Text variant="caption" style={{ color: dark ? palette.white : theme.colors.primary, fontSize: 13 }}>
              Voir tout
            </Text>
            <Ionicons name="arrow-forward" size={14} color={dark ? palette.white : theme.colors.primary} />
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
});
