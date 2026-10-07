import Ionicons from '@expo/vector-icons/Ionicons';
import type { Home, HomeCategory, HomeSection, ProductSummary } from '@afrisime/shared';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ErrorState, FadeIn, OfflineBanner, Pattern, Skeleton, Text } from '@/components/ui';
import { useMe } from '@/features/auth/hooks';
import { useSession } from '@/features/auth/session';
import { BannerCarousel } from '@/features/catalog/components/BannerCarousel';
import { CategoryTile } from '@/features/catalog/components/CategoryTile';
import { FlashCountdown } from '@/features/catalog/components/FlashCountdown';
import { ProductCardSkeleton } from '@/features/catalog/components/ProductCard';
import { ProductCarousel } from '@/features/catalog/components/ProductCarousel';
import { SearchEntry } from '@/features/catalog/components/SearchEntry';
import { useHome } from '@/features/catalog/hooks';
import { useAddresses } from '@/features/checkout/hooks';
import { useCheckout } from '@/features/checkout/store';
import { comingSoon } from '@/lib/comingSoon';
import { openAppLink, openProduct } from '@/lib/links';
import { gradients, palette, useTheme } from '@/theme';
import { TrustStrip } from '../components/TrustStrip';

const logo = require('../../../../assets/brand/logo.webp') as number;

const SECTION_OVERLINES: Partial<Record<HomeSection['type'], string>> = {
  best_sellers: 'LES PRÉFÉRÉS DE LOMÉ',
  local_products: 'SOUTENEZ LE LOCAL',
  new_arrivals: 'TOUT JUSTE ARRIVÉS',
  for_you: 'POUR VOUS',
};

function greeting(firstName: string | null | undefined): string {
  const h = new Date().getHours();
  const base = h < 5 || h >= 18 ? 'Bonsoir' : 'Bonjour';
  return firstName ? `${base}, ${firstName}` : `${base} !`;
}

export function HomeScreen() {
  const theme = useTheme();
  const home = useHome();

  // En-tête sombre : barre d'état claire tant que l'Accueil est affiché.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(theme.scheme === 'dark' ? 'light' : 'dark');
    }, [theme.scheme]),
  );

  const onPressProduct = useCallback((p: ProductSummary) => openProduct(p.slug), []);
  const onPressCategory = useCallback(
    (c: HomeCategory) => router.push({ pathname: '/boutique', params: { category: c.slug } }),
    [],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={home.isRefetching}
            onRefresh={() => void home.refetch()}
            colors={[theme.colors.primary]}
            tintColor={palette.white}
          />
        }
      >
        <Hero />
        <View style={{ marginTop: -30, paddingHorizontal: theme.spacing.lg, zIndex: 2 }}>
          <SearchEntry onPress={() => router.push('/search')} elevated />
        </View>
        <OfflineBanner updatedAt={home.dataUpdatedAt} />

        {home.data ? (
          <HomeContent home={home.data} onPressProduct={onPressProduct} onPressCategory={onPressCategory} />
        ) : home.isError ? (
          <View style={{ minHeight: 360 }}>
            <ErrorState error={home.error} onRetry={() => void home.refetch()} />
          </View>
        ) : (
          <HomeSkeleton />
        )}
      </ScrollView>
    </View>
  );
}

function Hero() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const authenticated = useSession((s) => s.status === 'authenticated');
  const me = useMe();
  const addresses = useAddresses(authenticated);
  const selectedId = useCheckout((s) => s.addressId);
  const address =
    addresses.data?.find((a) => a.id === selectedId) ?? addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0];

  return (
    <View style={[styles.hero, { paddingTop: insets.top + theme.spacing.md }]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Pattern color={palette.white} opacity={0.07} size={40} />

      <View style={[styles.heroTop, { paddingHorizontal: theme.spacing.lg }]}>
        <View style={[styles.logoPill, { borderRadius: theme.radius.md }]}>
          <Image source={logo} style={styles.logo} contentFit="contain" accessibilityLabel="AfriSime" />
        </View>
        <Pressable
          onPress={() => comingSoon('Les notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name="notifications-outline" size={22} color={palette.white} />
        </Pressable>
      </View>

      <FadeIn style={{ paddingHorizontal: theme.spacing.lg, gap: 6, marginTop: theme.spacing.xl }}>
        <Text variant="hero" style={{ color: palette.white }} accessibilityRole="header">
          {greeting(authenticated ? me.data?.firstName : null)}
        </Text>
        <Text variant="body" style={{ color: palette.brand200 }}>
          Qu’allons-nous vous livrer aujourd’hui ?
        </Text>
      </FadeIn>

      <Pressable
        onPress={() => (authenticated ? router.push('/checkout/address') : router.push('/login'))}
        accessibilityRole="button"
        accessibilityLabel={address ? `Livraison à ${address.district}` : 'Choisir mon adresse de livraison'}
        style={({ pressed }) => [
          styles.location,
          { marginHorizontal: theme.spacing.lg, borderRadius: theme.radius.pill, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Ionicons name="location" size={16} color={palette.accent500} />
        <Text variant="caption" style={{ color: palette.white }} numberOfLines={1}>
          {address ? `Livraison à ${address.district}` : 'Lomé · ajoutez votre adresse'}
        </Text>
        {address?.zoneName ? (
          <Text variant="caption" style={{ color: palette.brand200 }} numberOfLines={1}>
            · {address.zoneName.split(' · ')[0]}
          </Text>
        ) : null}
        <Ionicons name="chevron-down" size={14} color={palette.brand200} />
      </Pressable>
    </View>
  );
}

type ContentProps = {
  home: Home;
  onPressProduct: (p: ProductSummary) => void;
  onPressCategory: (c: HomeCategory) => void;
};

function HomeContent({ home, onPressProduct, onPressCategory }: ContentProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const tileSize = (width - theme.spacing.lg * 2 - theme.spacing.md * 2) / 3;
  const flash = home.sections.find((s) => s.type === 'flash_sale');
  const others = home.sections.filter((s) => s.type !== 'flash_sale');
  let i = 0;

  return (
    <View style={{ gap: theme.spacing.xxl, paddingTop: theme.spacing.xl }}>
      <FadeIn index={i++}>
        <BannerCarousel banners={home.banners} onPressBanner={(b) => openAppLink(b.link)} />
      </FadeIn>

      {home.categories.length > 0 ? (
        <FadeIn index={i++} style={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }}>
          <View style={{ gap: 4 }}>
            <Text variant="overline" color="accent">
              FAITES LE TOUR
            </Text>
            <Text variant="title" accessibilityRole="header">
              Nos rayons
            </Text>
          </View>
          <View style={styles.grid}>
            {home.categories.map((c) => (
              <CategoryTile key={c.id} category={c} onPress={onPressCategory} size={tileSize} />
            ))}
          </View>
        </FadeIn>
      ) : null}

      {flash ? (
        <FadeIn index={i++} style={{ paddingHorizontal: theme.spacing.sm }}>
          <View style={[styles.flash, { borderRadius: theme.radius.xl, boxShadow: theme.shadows.md }]}>
            <LinearGradient colors={gradients.night} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Pattern color={palette.accent500} opacity={0.07} size={34} />
            <ProductCarousel
              tone="dark"
              overline="⚡ À NE PAS MANQUER"
              title={flash.title}
              products={flash.items}
              onPressProduct={onPressProduct}
              onSeeAll={flash.link ? () => openAppLink(flash.link) : undefined}
              accessory={flash.endsAt ? <FlashCountdown endsAt={flash.endsAt} /> : null}
            />
          </View>
        </FadeIn>
      ) : null}

      {others.map((s) => (
        <FadeIn key={s.id} index={i++}>
          <ProductCarousel
            overline={SECTION_OVERLINES[s.type]}
            title={s.title}
            products={s.items}
            onPressProduct={onPressProduct}
            onSeeAll={s.link ? () => openAppLink(s.link) : undefined}
          />
        </FadeIn>
      ))}

      <FadeIn index={i++}>
        <TrustStrip />
      </FadeIn>
    </View>
  );
}

function HomeSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.xl, paddingTop: theme.spacing.xl }} accessibilityLabel="Chargement">
      <Skeleton height={196} radius={theme.radius.xl} />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        {[0, 1, 2].map((k) => (
          <Skeleton key={k} width="31%" height={110} radius={theme.radius.lg} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        {[0, 1].map((k) => (
          <View key={k} style={{ width: 172 }}>
            <ProductCardSkeleton />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingBottom: 54,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoPill: {
    backgroundColor: palette.white,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logo: {
    width: 118,
    height: 31,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  flash: {
    overflow: 'hidden',
    paddingVertical: 20,
  },
});
