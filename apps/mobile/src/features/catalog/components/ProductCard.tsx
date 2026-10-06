import type { ProductSummary } from '@afrisime/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { presentAvailability } from '../availability';
import { productBadges } from '../badges';
import { summaryPriceLabel } from '../pricing';
import { AvailabilityTag } from './AvailabilityTag';
import { ProductThumb } from './ProductThumb';

type Props = {
  product: ProductSummary;
  onPress: (product: ProductSummary) => void;
};

/** Carte produit : vignette, badges, nom, conditionnement, prix et disponibilité. */
export const ProductCard = memo(function ProductCard({ product, onPress }: Props) {
  const theme = useTheme();
  const v = product.defaultVariant;
  const availability = presentAvailability(v.availability, v.leadTimeDays);
  const price = summaryPriceLabel(product);
  const badge = product.badges.map((b) => productBadges[b]).find((b) => b !== null);
  const dimmed = !availability.purchasable && v.availability === 'unavailable';

  const a11y = [
    product.name,
    product.brand,
    price,
    v.availability !== 'available' ? availability.label : null,
    product.discountPercent ? `remise ${product.discountPercent} %` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Ouvre la fiche produit"
      onPress={() => onPress(product)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.thumb, { opacity: dimmed ? 0.55 : 1 }]}>
        <ProductThumb name={product.name} imageUrl={product.imageUrl} color={product.color} />
        <View style={[styles.badges, { gap: theme.spacing.xs, padding: theme.spacing.sm }]}>
          {product.discountPercent ? <Badge label={`-${product.discountPercent} %`} tone="accent" /> : null}
          {badge && badge.tone !== 'accent' ? <Badge label={badge.label} tone={badge.tone} /> : null}
        </View>
      </View>
      <View style={{ padding: theme.spacing.md, gap: theme.spacing.xs }}>
        <Text variant="micro" color="textMuted" numberOfLines={1}>
          {product.brand.toUpperCase()}
        </Text>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.name}>
          {product.name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {v.label}
          {product.variantsCount > 1 ? ` · ${product.variantsCount} formats` : ''}
        </Text>
        <Text variant="price" color={v.price === null ? 'warning' : 'text'} numberOfLines={1}>
          {price}
        </Text>
        <AvailabilityTag availability={v.availability} leadTimeDays={v.leadTimeDays} hideWhenAvailable />
      </View>
    </Pressable>
  );
});

export function ProductCardSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radius.lg },
      ]}
    >
      <View style={styles.thumb}>
        <Skeleton height="100%" radius={0} />
      </View>
      <View style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}>
        <Skeleton width="40%" height={10} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="60%" height={12} />
        <Skeleton width="50%" height={16} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thumb: {
    width: '100%',
    aspectRatio: 1.15,
  },
  badges: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  name: {
    minHeight: 44,
  },
});
