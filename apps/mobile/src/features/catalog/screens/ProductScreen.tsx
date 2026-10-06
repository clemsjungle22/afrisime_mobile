import { formatFCFA, type ProductDetail, type ProductSummary, type Variant } from '@afrisime/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Badge, Button, EmptyState, ErrorState, OfflineBanner, Skeleton, Text } from '@/components/ui';
import { comingSoon } from '@/lib/comingSoon';
import { openProduct } from '@/lib/links';
import { useTheme } from '@/theme';
import { isApiError } from '@/api/errors';
import { presentAvailability, type AvailabilityAction } from '../availability';
import { productBadges } from '../badges';
import { priceRangeLabel } from '../pricing';
import { ProductCarousel } from '../components/ProductCarousel';
import { ProductThumb } from '../components/ProductThumb';
import { QuantityStepper } from '../components/QuantityStepper';
import { VariantSelector } from '../components/VariantSelector';
import { useProduct } from '../hooks';

const ProductParams = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) });

export function ProductScreen() {
  const params = ProductParams.safeParse(useLocalSearchParams());
  if (!params.success) {
    return (
      <EmptyState
        icon="help-circle-outline"
        title="Produit introuvable"
        description="Ce lien ne correspond à aucun produit."
      />
    );
  }
  return <ProductLoader slug={params.data.slug} />;
}

function ProductLoader({ slug }: { slug: string }) {
  const theme = useTheme();
  const product = useProduct(slug);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: product.data?.name ?? '' }} />
      <OfflineBanner updatedAt={product.dataUpdatedAt} />
      {product.data ? (
        // key : réinitialise variante et quantité quand on navigue vers un produit associé.
        <ProductContent key={product.data.id} product={product.data} />
      ) : product.isError ? (
        isApiError(product.error) && product.error.code === 'NOT_FOUND' ? (
          <EmptyState
            icon="help-circle-outline"
            title="Produit introuvable"
            description="Il a peut-être été retiré du catalogue."
          />
        ) : (
          <ErrorState error={product.error} onRetry={() => void product.refetch()} />
        )
      ) : (
        <ProductSkeleton />
      )}
    </View>
  );
}

const actionFeature: Record<AvailabilityAction, string> = {
  add_to_cart: 'Le panier',
  order: 'La commande de produits sur commande',
  notify_me: "L'alerte de retour en stock",
  request_quote: 'La demande de devis',
};

function ProductContent({ product }: { product: ProductDetail }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [variant, setVariant] = useState<Variant>(product.defaultVariant);
  const [quantity, setQuantity] = useState(product.defaultVariant.minQuantity);

  const availability = presentAvailability(variant.availability, variant.leadTimeDays);
  const range = priceRangeLabel(product);
  const badges = product.badges.map((b) => productBadges[b]).filter((b) => b !== null);

  const selectVariant = useCallback((v: Variant) => {
    setVariant(v);
    setQuantity((q) => Math.max(q, v.minQuantity));
  }, []);

  const onPressRelated = useCallback((p: ProductSummary) => openProduct(p.slug), []);

  // Estimation affichée seulement : le total qui fait foi est recalculé par le serveur au checkout.
  const estimate = variant.price !== null && availability.purchasable ? variant.price * quantity : null;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}>
        <View style={styles.hero}>
          <ProductThumb name={product.name} imageUrl={product.imageUrl} color={product.color} size="lg" />
        </View>

        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <View style={[styles.row, { gap: theme.spacing.xs }]}>
            {badges.map((b) => (
              <Badge key={b.label} label={b.label} tone={b.tone} />
            ))}
            <Badge label={product.origin === 'local' ? 'Produit local' : 'Importé'} tone="neutral" />
          </View>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" color="textMuted">
              {product.brand}
            </Text>
            <Text variant="title" accessibilityRole="header">
              {product.name}
            </Text>
            {range ? (
              <Text variant="body" color="textMuted">
                {range}
              </Text>
            ) : null}
          </View>

          <Text variant="subtitle" style={{ marginTop: theme.spacing.sm }}>
            Choisissez un format
          </Text>
          <VariantSelector variants={product.variants} selectedId={variant.id} onSelect={selectVariant} />

          {product.description ? (
            <View style={{ gap: theme.spacing.xs, marginTop: theme.spacing.sm }}>
              <Text variant="subtitle">Description</Text>
              <Text color="textMuted">{product.description}</Text>
            </View>
          ) : null}
        </View>

        {product.related.length > 0 ? (
          <ProductCarousel
            title="Souvent achetés avec"
            products={product.related}
            onPressProduct={onPressRelated}
          />
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.actionBar,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: Math.max(insets.bottom, theme.spacing.md),
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
          },
        ]}
      >
        <View style={[styles.row, styles.between]}>
          <View style={styles.flex}>
            <Text variant="caption" color="textMuted">
              {variant.label}
              {availability.hint ? ` · ${availability.hint}` : ''}
            </Text>
            <Text variant="price" color={variant.price === null ? 'warning' : 'text'}>
              {estimate !== null
                ? formatFCFA(estimate)
                : variant.price === null
                  ? 'Prix sur devis'
                  : availability.label}
            </Text>
          </View>
          {availability.purchasable ? (
            <QuantityStepper value={quantity} min={variant.minQuantity} onChange={setQuantity} />
          ) : null}
        </View>
        <Button
          label={availability.ctaLabel}
          variant={availability.purchasable ? 'primary' : 'secondary'}
          size="lg"
          fullWidth
          onPress={() => comingSoon(actionFeature[availability.action])}
        />
      </View>
    </View>
  );
}

function ProductSkeleton() {
  const theme = useTheme();
  return (
    <View accessibilityLabel="Chargement du produit">
      <Skeleton height={260} radius={0} />
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <Skeleton width="30%" height={12} />
        <Skeleton width="80%" height={24} />
        <Skeleton width="50%" height={16} />
        <Skeleton height={56} radius={theme.radius.md} />
        <Skeleton height={56} radius={theme.radius.md} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    width: '100%',
    aspectRatio: 1.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  between: {
    justifyContent: 'space-between',
    flexWrap: 'nowrap',
    gap: 12,
  },
  actionBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
