import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA, type ProductSummary } from '@afrisime/shared';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, PressableScale, Skeleton, Text } from '@/components/ui';
import { useCart } from '@/features/cart/store';
import { haptics } from '@/lib/haptics';
import { showSnackbar } from '@/stores/snackbar';
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

/** Ajout express du format principal, sans ouvrir la fiche. */
function QuickAdd({ product }: { product: ProductSummary }) {
  const theme = useTheme();
  const add = useCart((s) => s.add);
  const v = product.defaultVariant;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ajouter ${product.name}, ${v.label}, au panier`}
      hitSlop={8}
      onPress={() => {
        add(product, v, v.minQuantity);
        haptics.tap();
        showSnackbar({
          message: `${product.name} · ${v.label} ajouté`,
          actionLabel: 'Voir le panier',
          onAction: () => router.navigate('/panier'),
        });
      }}
      style={({ pressed }) => [
        styles.quickAdd,
        {
          backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
          boxShadow: theme.shadows.md,
        },
      ]}
    >
      <Ionicons name="add" size={24} color={theme.colors.onPrimary} />
    </Pressable>
  );
}

/** Carte produit : visuel illustré, badges, nom, format, prix (barré si promo), ajout express. */
export const ProductCard = memo(function ProductCard({ product, onPress }: Props) {
  const theme = useTheme();
  const v = product.defaultVariant;
  const availability = presentAvailability(v.availability, v.leadTimeDays);
  const price = summaryPriceLabel(product);
  const badge = product.badges.map((b) => productBadges[b]).find((b) => b !== null && b.tone !== 'accent');
  const dimmed = v.availability === 'unavailable';
  const showCompare = v.compareAtPrice !== null && v.price !== null && v.compareAtPrice > v.price && product.variantsCount === 1;

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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityHint="Ouvre la fiche produit"
      onPress={() => onPress(product)}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          boxShadow: theme.shadows.sm,
          padding: theme.spacing.sm,
        },
      ]}
    >
      <View style={[styles.thumb, { borderRadius: theme.radius.md, opacity: dimmed ? 0.55 : 1 }]}>
        <ProductThumb name={product.name} imageUrl={product.imageUrl} color={product.color} />
        <View style={[styles.badges, { gap: theme.spacing.xs, padding: theme.spacing.sm }]}>
          {product.discountPercent ? <Badge label={`-${product.discountPercent} %`} tone="accent" /> : null}
          {badge ? <Badge label={badge.label} tone={badge.tone} /> : null}
        </View>
        {availability.purchasable ? <QuickAdd product={product} /> : null}
      </View>
      <View style={{ paddingHorizontal: 6, paddingTop: theme.spacing.md, paddingBottom: 6, gap: 3 }}>
        <Text variant="overline" color="textMuted" numberOfLines={1}>
          {product.brand.toUpperCase()}
        </Text>
        <Text variant="bodyStrong" numberOfLines={2} style={styles.name}>
          {product.name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {v.label}
          {product.variantsCount > 1 ? ` · ${product.variantsCount} formats` : ''}
        </Text>
        <View style={styles.priceRow}>
          <Text variant="price" color={v.price === null ? 'warning' : 'text'} numberOfLines={1}>
            {price}
          </Text>
          {showCompare ? (
            <Text variant="caption" color="textMuted" style={styles.strike} numberOfLines={1}>
              {formatFCFA(v.compareAtPrice!)}
            </Text>
          ) : null}
        </View>
        <AvailabilityTag availability={v.availability} leadTimeDays={v.leadTimeDays} hideWhenAvailable />
      </View>
    </PressableScale>
  );
});

export function ProductCardSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.sm,
          boxShadow: theme.shadows.sm,
        },
      ]}
    >
      <View style={[styles.thumb, { borderRadius: theme.radius.md }]}>
        <Skeleton height="100%" radius={theme.radius.md} />
      </View>
      <View style={{ padding: 6, paddingTop: theme.spacing.md, gap: theme.spacing.sm }}>
        <Skeleton width="40%" height={10} />
        <Skeleton width="90%" height={14} />
        <Skeleton width="60%" height={12} />
        <Skeleton width="50%" height={18} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1.05,
    overflow: 'hidden',
  },
  badges: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  quickAdd: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    minHeight: 44,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
});
