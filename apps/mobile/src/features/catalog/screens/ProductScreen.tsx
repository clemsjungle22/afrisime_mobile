import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA, toSummary, type ProductDetail, type ProductSummary, type Variant } from '@afrisime/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';
import { isApiError } from '@/api/errors';
import { Badge, Button, EmptyState, ErrorState, FadeIn, OfflineBanner, Skeleton, Text } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { useCart, useCartCount } from '@/features/cart/store';
import { AddToListSheet } from '@/features/lists/components/AddToListSheet';
import { FavoriteButton } from '@/features/lists/components/FavoriteButton';
import { comingSoon } from '@/lib/comingSoon';
import { haptics } from '@/lib/haptics';
import { openProduct } from '@/lib/links';
import { showSnackbar } from '@/stores/snackbar';
import { palette, useTheme } from '@/theme';
import { presentAvailability, type AvailabilityAction } from '../availability';
import { productBadges } from '../badges';
import { priceRangeLabel, variantDiscountPercent } from '../pricing';
import { ProductCarousel } from '../components/ProductCarousel';
import { ProductThumb } from '../components/ProductThumb';
import { QuantityStepper } from '../components/QuantityStepper';
import { VariantSelector } from '../components/VariantSelector';
import { useProduct } from '../hooks';

const ProductParams = z.object({ slug: z.string().regex(/^[a-z0-9-]+$/) });
const HERO_HEIGHT = 360;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Bouton rond flottant au-dessus de l'illustration. */
function RoundButton({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  badge?: number;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.round,
        { backgroundColor: theme.colors.surface, boxShadow: theme.shadows.md, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name={icon} size={22} color={theme.colors.text} />
      {badge ? (
        <View style={styles.roundBadge}>
          <Text variant="micro" style={{ color: palette.brand950, fontSize: 10 }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function ProductScreen() {
  const params = ProductParams.safeParse(useLocalSearchParams());
  if (!params.success) {
    return (
      <EmptyState icon="help-circle-outline" title="Produit introuvable" description="Ce lien ne correspond à aucun produit." />
    );
  }
  return <ProductLoader slug={params.data.slug} />;
}

function ProductLoader({ slug }: { slug: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const product = useProduct(slug);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ headerShown: false, title: product.data?.name ?? 'Produit' }} />
      {product.data ? (
        // key : réinitialise format et quantité quand on navigue vers un produit associé.
        <ProductContent key={product.data.id} product={product.data} />
      ) : (
        <View style={{ flex: 1, paddingTop: insets.top + 64 }}>
          <OfflineBanner updatedAt={product.dataUpdatedAt} />
          {product.isError ? (
            isApiError(product.error) && product.error.code === 'NOT_FOUND' ? (
              <EmptyState icon="help-circle-outline" title="Produit introuvable" description="Il a peut-être été retiré du catalogue." />
            ) : (
              <ErrorState error={product.error} onRetry={() => void product.refetch()} />
            )
          ) : (
            <ProductSkeleton />
          )}
          <View style={[styles.topBar, { top: insets.top + 8 }]}>
            <RoundButton icon="arrow-back" label="Retour" onPress={goBack} />
          </View>
        </View>
      )}
    </View>
  );
}

/** Actions pas encore livrées (les ajouts au panier sont gérés à part). */
const actionFeature: Record<Exclude<AvailabilityAction, 'add_to_cart' | 'order'>, string> = {
  notify_me: "L'alerte de retour en stock",
  request_quote: 'La demande de devis',
};

function ProductContent({ product }: { product: ProductDetail }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cartCount = useCartCount();
  const [variant, setVariant] = useState<Variant>(product.defaultVariant);
  const [quantity, setQuantity] = useState(product.defaultVariant.minQuantity);
  const [listSheet, setListSheet] = useState(false);
  const authenticated = useSession((st) => st.status === 'authenticated');
  const summary = useMemo(() => toSummary(product), [product]);

  const availability = presentAvailability(variant.availability, variant.leadTimeDays);
  const range = priceRangeLabel(product);
  const badges = product.badges.map((b) => productBadges[b]).filter((b) => b !== null);
  const discount = variantDiscountPercent(variant);
  const heroHeight = HERO_HEIGHT + insets.top;

  // Parallaxe : l'illustration défile plus lentement et s'agrandit si on tire vers le bas.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-200, 0, heroHeight], [-100, 0, heroHeight * 0.45], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-200, 0], [1.35, 1], Extrapolation.CLAMP) },
    ],
  }));
  const titleBarStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [heroHeight - 140, heroHeight - 80], [0, 1], Extrapolation.CLAMP),
  }));

  const selectVariant = useCallback((v: Variant) => {
    haptics.select();
    setVariant(v);
    setQuantity((q) => Math.max(q, v.minQuantity));
  }, []);

  const onPressRelated = useCallback((p: ProductSummary) => openProduct(p.slug), []);
  const addToCart = useCart((s) => s.add);

  const onAction = () => {
    const action = availability.action;
    if (action === 'add_to_cart' || action === 'order') {
      const total = addToCart(product, variant, quantity);
      haptics.tap();
      showSnackbar({
        message: total > quantity ? `Ajouté — ${total} dans votre panier` : `${product.name} · ${variant.label} ajouté`,
        actionLabel: 'Voir le panier',
        onAction: () => router.navigate('/panier'),
      });
      return;
    }
    comingSoon(actionFeature[action]);
  };

  // Estimation affichée seulement : le total qui fait foi est recalculé par le serveur au checkout.
  const estimate = variant.price !== null && availability.purchasable ? variant.price * quantity : null;
  const ctaLabel =
    estimate !== null ? `${availability.action === 'order' ? 'Commander' : 'Ajouter'} · ${formatFCFA(estimate)}` : availability.ctaLabel;

  return (
    <View style={styles.flex}>
      <Animated.View style={[styles.hero, { height: heroHeight, width }, heroStyle]}>
        <ProductThumb name={product.name} imageUrl={product.imageUrl} color={product.color} variant="vivid" />
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: heroHeight - 36, paddingBottom: 140 + insets.bottom }}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: theme.radius.xl + 4,
              borderTopRightRadius: theme.radius.xl + 4,
              padding: theme.spacing.lg,
              paddingTop: theme.spacing.xl,
              gap: theme.spacing.lg,
            },
          ]}
        >
          <OfflineBanner />
          <FadeIn style={{ gap: theme.spacing.sm }}>
            <View style={[styles.row, { gap: theme.spacing.xs }]}>
              {badges.map((b) => (
                <Badge key={b.label} label={b.label} tone={b.tone} />
              ))}
              <Badge label={product.origin === 'local' ? '🇹🇬 Produit local' : 'Importé'} tone={product.origin === 'local' ? 'success' : 'neutral'} />
            </View>
            <Text variant="overline" color="textMuted">
              {product.brand.toUpperCase()}
            </Text>
            <Text variant="display" accessibilityRole="header">
              {product.name}
            </Text>
            <View style={[styles.row, { gap: theme.spacing.sm, alignItems: 'baseline' }]}>
              <Text variant="priceLg" color={variant.price === null ? 'warning' : 'primary'}>
                {variant.price === null ? 'Prix sur devis' : formatFCFA(variant.price)}
              </Text>
              {discount !== null ? (
                <>
                  <Text color="textMuted" style={{ textDecorationLine: 'line-through' }}>
                    {formatFCFA(variant.compareAtPrice!)}
                  </Text>
                  <Badge label={`-${discount} %`} tone="accent" />
                </>
              ) : null}
            </View>
            {product.priceRange ? (
              <View
                accessibilityLabel={`Prix de ${formatFCFA(product.priceRange.min)} à ${formatFCFA(product.priceRange.max)}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  alignSelf: 'flex-start',
                  paddingVertical: theme.spacing.xs,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primarySoft,
                }}
              >
                <Ionicons name="pricetags-outline" size={16} color={theme.colors.primary} />
                <Text variant="caption" color="onPrimarySoft">
                  Prix : de <Text variant="bodyStrong" color="onPrimarySoft">{formatFCFA(product.priceRange.min)}</Text> à{' '}
                  <Text variant="bodyStrong" color="onPrimarySoft">{formatFCFA(product.priceRange.max)}</Text>
                </Text>
              </View>
            ) : range && product.variantsCount > 1 ? (
              <Text variant="caption" color="textMuted">
                {product.variantsCount} formats · de {range}
              </Text>
            ) : null}
          </FadeIn>

          <FadeIn index={1} style={{ gap: theme.spacing.md }}>
            <Text variant="subtitle">Choisissez un format</Text>
            <VariantSelector variants={product.variants} selectedId={variant.id} onSelect={selectVariant} />
            <Button
              label="Ajouter à une liste d’achats"
              variant="ghost"
              icon={<Ionicons name="list-outline" size={20} color={theme.colors.primary} />}
              onPress={() => {
                if (authenticated) return setListSheet(true);
                showSnackbar({
                  message: 'Connectez-vous pour créer vos listes d’achats.',
                  actionLabel: 'Se connecter',
                  onAction: () => router.push('/login'),
                });
              }}
            />
          </FadeIn>

          <FadeIn index={2} style={[styles.row, { gap: theme.spacing.sm, flexWrap: 'nowrap' }]}>
            {[
              { icon: 'bicycle' as const, title: 'Livraison à Lomé', text: 'Créneau au choix' },
              { icon: 'phone-portrait' as const, title: 'Mobile Money', text: 'ou à la livraison' },
            ].map((info) => (
              <View
                key={info.title}
                style={[
                  styles.info,
                  { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, boxShadow: theme.shadows.sm, padding: theme.spacing.md },
                ]}
              >
                <Ionicons name={info.icon} size={20} color={theme.colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text variant="label" style={{ fontSize: 13 }}>
                    {info.title}
                  </Text>
                  <Text variant="micro" color="textMuted">
                    {info.text}
                  </Text>
                </View>
              </View>
            ))}
          </FadeIn>

          {product.description ? (
            <FadeIn index={3} style={{ gap: theme.spacing.xs }}>
              <Text variant="subtitle">À propos</Text>
              <Text color="textMuted">{product.description}</Text>
            </FadeIn>
          ) : null}
        </View>

        {product.related.length > 0 ? (
          <View style={{ backgroundColor: theme.colors.background, paddingTop: theme.spacing.md }}>
            <ProductCarousel overline="ILS VONT BIEN ENSEMBLE" title="Souvent achetés avec" products={product.related} onPressProduct={onPressRelated} />
          </View>
        ) : null}
      </Animated.ScrollView>

      {/* Barre de titre qui apparaît en défilant */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.titleBar,
          { height: insets.top + 64, paddingTop: insets.top, backgroundColor: theme.colors.background, boxShadow: theme.shadows.sm },
          titleBarStyle,
        ]}
      >
        <Text variant="subtitle" numberOfLines={1} style={{ marginHorizontal: 72 }}>
          {product.name}
        </Text>
      </Animated.View>

      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <RoundButton icon="arrow-back" label="Retour" onPress={goBack} />
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          <FavoriteButton product={summary} appearance="round" />
          <RoundButton
            icon="bag-handle-outline"
            label={cartCount > 0 ? `Panier, ${cartCount} articles` : 'Panier'}
            onPress={() => router.navigate('/panier')}
            badge={cartCount}
          />
        </View>
      </View>

      <AddToListSheet
        visible={listSheet}
        onClose={() => setListSheet(false)}
        item={{ variantId: variant.id, quantity }}
        label={`${product.name} · ${variant.label} × ${quantity}`}
      />

      <View style={[styles.actionWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.xl,
              boxShadow: theme.shadows.lg,
              padding: theme.spacing.sm,
              gap: theme.spacing.sm,
            },
          ]}
        >
          {availability.purchasable ? (
            <QuantityStepper value={quantity} min={variant.minQuantity} onChange={setQuantity} />
          ) : null}
          <View style={styles.flex}>
            <Button
              label={ctaLabel}
              variant={availability.purchasable ? 'primary' : 'secondary'}
              size="lg"
              fullWidth
              onPress={onAction}
            />
          </View>
        </View>
        {availability.hint ? (
          <Text variant="caption" color="info" align="center" style={{ marginTop: 6 }}>
            {variant.label} · {availability.hint}
          </Text>
        ) : null}
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
        <Skeleton width="80%" height={28} />
        <Skeleton width="45%" height={26} />
        <Skeleton height={60} radius={theme.radius.md} />
        <Skeleton height={60} radius={theme.radius.md} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  sheet: {
    minHeight: 420,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  titleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent500,
  },
  actionWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 0,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
