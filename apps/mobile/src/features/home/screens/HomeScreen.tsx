import Ionicons from '@expo/vector-icons/Ionicons';
import {
  DEFAULT_HOME_APPEARANCE,
  type Home,
  type HomeCategory,
  type HomeSection,
  type ProductSummary,
  formatFCFA,
} from '@afrisime/shared';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FLOATING_TAB_BAR_SPACE } from '@/components/navigation/FloatingTabBar';
import { ErrorState, FadeIn, OfflineBanner, Pattern, Skeleton, Text } from '@/components/ui';
import { useMe } from '@/features/auth/hooks';
import { useSession } from '@/features/auth/session';
import { useNotifications } from '@/features/notifications/hooks';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { BannerCarousel } from '@/features/catalog/components/BannerCarousel';
import { PacksTeaser } from '@/features/carnets/components/PacksTeaser';
import { useStoreCredit } from '@/features/carnets/hooks';
import { CategoryTile } from '@/features/catalog/components/CategoryTile';
import { mediaUri } from '@/lib/media';
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

const logo = require('../../../../assets/brand/logo.webp') as number;

/** Couleur unie des en-têtes : en-tête fixe, salutation et bande de la recherche se raccordent sans couture. */
const HEADER_COLOR = palette.brand900;
/** Moitié de la barre de recherche (58 px) qui chevauche le vert. */
const SEARCH_OVERLAP = 29;
const CATEGORY_TILE = 116;

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
      {/* En-tête FIXE : logo et notifications restent toujours visibles, rien ne passe dessus. */}
      <TopBar />

      <ScrollView
        // L'élément 1 (barre de recherche) s'accroche sous l'en-tête : le contenu défile DESSOUS.
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: FLOATING_TAB_BAR_SPACE + theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={home.isRefetching}
            onRefresh={() => void home.refetch()}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Greeting />
        <StickySearch />
        <View>
          <OfflineBanner updatedAt={home.dataUpdatedAt} />
          {home.data ? (
            <HomeContent
              home={home.data}
              onPressProduct={onPressProduct}
              onPressCategory={onPressCategory}
            />
          ) : home.isError ? (
            <View style={{ minHeight: 360 }}>
              <ErrorState error={home.error} onRetry={() => void home.refetch()} />
            </View>
          ) : (
            <HomeSkeleton />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function TopBar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const remoteLogo = mediaUri(useHome().data?.appearance?.logoUrl);
  const [logoFailed, setLogoFailed] = useState(false);
  return (
    <View
      style={[
        styles.topBar,
        { paddingTop: insets.top + theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
      ]}
    >
      <Pattern color={palette.white} opacity={0.07} size={40} />
      <View style={[styles.logoPill, { borderRadius: theme.radius.md }]}>
        <Image
          source={remoteLogo && !logoFailed ? { uri: remoteLogo } : logo}
          onError={() => setLogoFailed(true)}
          style={styles.logo}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessibilityLabel="AfriSime"
        />
      </View>
      <NotificationBell />
    </View>
  );
}

/** Cloche : pastille du nombre de notifications non lues. */
function NotificationBell() {
  const theme = useTheme();
  const authenticated = useSession((s) => s.status === 'authenticated');
  const notifications = useNotifications();
  useRefetchOnFocus(notifications.refetch);
  const unread = authenticated ? (notifications.data?.unread ?? 0) : 0;
  return (
    <Pressable
      onPress={() => router.push(authenticated ? '/notifications' : '/login')}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}
      style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={22} color={palette.white} />
      {unread > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.accent,
          }}
        >
          <Text variant="caption" style={{ color: theme.colors.onAccent, fontSize: 11, lineHeight: 14, fontWeight: '700' }}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Salutation et adresse : défilent normalement et passent sous l'en-tête fixe. */
function Greeting() {
  const theme = useTheme();
  const greetingSubtitle =
    useHome().data?.appearance?.greetingSubtitle ?? DEFAULT_HOME_APPEARANCE.greetingSubtitle;
  const authenticated = useSession((s) => s.status === 'authenticated');
  const me = useMe();
  const addresses = useAddresses(authenticated);
  const selectedId = useCheckout((s) => s.addressId);
  const creditBalance = useStoreCredit().data?.balance ?? 0;
  const address =
    addresses.data?.find((a) => a.id === selectedId) ??
    addresses.data?.find((a) => a.isDefault) ??
    addresses.data?.[0];

  return (
    <View style={[styles.greeting, { paddingHorizontal: theme.spacing.lg }]}>
      <Pattern color={palette.white} opacity={0.07} size={40} />
      <FadeIn style={{ gap: 6 }}>
        <Text variant="hero" style={{ color: palette.white }} accessibilityRole="header">
          {greeting(authenticated ? me.data?.firstName : null)}
        </Text>
        <Text style={{ color: palette.brand200 }}>{greetingSubtitle}</Text>
      </FadeIn>
      <Pressable
        onPress={() => (authenticated ? router.push('/checkout/address') : router.push('/login'))}
        accessibilityRole="button"
        accessibilityLabel={
          address ? `Livraison à ${address.district}` : 'Choisir mon adresse de livraison'
        }
        style={({ pressed }) => [
          styles.location,
          { borderRadius: theme.radius.pill, opacity: pressed ? 0.8 : 1 },
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
      {creditBalance > 0 ? (
        <Pressable
          onPress={() => router.push('/avoir')}
          accessibilityRole="button"
          accessibilityLabel={`Mon avoir : ${formatFCFA(creditBalance)}, utilisable à la prochaine commande`}
          style={({ pressed }) => [
            styles.location,
            { marginTop: 8, borderRadius: theme.radius.pill, backgroundColor: palette.accent500, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="wallet" size={16} color={palette.brand950} />
          <Text variant="caption" style={{ color: palette.brand950, fontWeight: '700' }} numberOfLines={1}>
            Mon avoir : {formatFCFA(creditBalance)} à utiliser
          </Text>
          <Ionicons name="chevron-forward" size={14} color={palette.brand950} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Barre de recherche accrochée : une bande verte (coins bas arrondis) la relie à l'en-tête.
 * Une fois accrochée, l'ensemble forme un en-tête dont la recherche déborde ; le contenu défile dessous.
 */
function StickySearch() {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
      <View style={styles.searchBand}>
        <Pattern color={palette.white} opacity={0.07} size={40} />
      </View>
      <SearchEntry onPress={() => router.push('/search')} elevated />
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
  // Réglé dans le back-office (textes d'origine si l'accueil vient d'une ancienne version).
  const categoriesBlock =
    (home.appearance ?? DEFAULT_HOME_APPEARANCE).blocks.categories ??
    DEFAULT_HOME_APPEARANCE.blocks.categories!;
  const flash = home.sections.find((s) => s.type === 'flash_sale');
  const others = home.sections.filter((s) => s.type !== 'flash_sale');
  let i = 0;

  return (
    <View style={{ gap: theme.spacing.xxl, paddingTop: theme.spacing.lg }}>
      <FadeIn index={i++}>
        <BannerCarousel banners={home.banners} onPressBanner={(b) => openAppLink(b.link)} />
      </FadeIn>

      {home.categories.length > 0 && categoriesBlock.visible ? (
        <FadeIn index={i++} style={{ gap: theme.spacing.md }}>
          <View style={{ gap: 4, paddingHorizontal: theme.spacing.lg }}>
            {categoriesBlock.overline ? (
              <Text variant="overline" color="accent">
                {categoriesBlock.overline}
              </Text>
            ) : null}
            <Text variant="title" accessibilityRole="header">
              {categoriesBlock.title}
            </Text>
          </View>
          {/* Rangée horizontale, comme les sections de produits. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel="Rayons"
            contentContainerStyle={{
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: 6,
              gap: theme.spacing.md,
            }}
          >
            {home.categories.map((c) => (
              <CategoryTile
                key={c.id}
                category={c}
                onPress={onPressCategory}
                size={CATEGORY_TILE}
              />
            ))}
          </ScrollView>
        </FadeIn>
      ) : null}

      <FadeIn index={i++}>
        <PacksTeaser />
      </FadeIn>

      {flash ? (
        <FadeIn index={i++}>
          {/* Bande pleine largeur : les produits défilent d'un bord à l'autre de l'écran. */}
          <View style={styles.flash}>
            <LinearGradient
              colors={gradients.night}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Pattern color={palette.accent500} opacity={0.07} size={34} />
            <ProductCarousel
              tone="dark"
              overline={flash.overline ?? undefined}
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
            overline={s.overline ?? SECTION_OVERLINES[s.type]}
            title={s.title}
            products={s.items}
            onPressProduct={onPressProduct}
            onSeeAll={s.link ? () => openAppLink(s.link) : undefined}
          />
        </FadeIn>
      ))}
    </View>
  );
}

function HomeSkeleton() {
  const theme = useTheme();
  return (
    <View
      style={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}
      accessibilityLabel="Chargement"
    >
      <Skeleton height={214} radius={theme.radius.xl} />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        {[0, 1, 2].map((k) => (
          <Skeleton
            key={k}
            width={CATEGORY_TILE}
            height={CATEGORY_TILE * 1.08}
            radius={theme.radius.lg}
          />
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
  topBar: {
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    backgroundColor: HEADER_COLOR,
    overflow: 'hidden',
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
  greeting: {
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: HEADER_COLOR,
    overflow: 'hidden',
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
  searchBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SEARCH_OVERLAP,
    backgroundColor: HEADER_COLOR,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  flash: {
    overflow: 'hidden',
    paddingTop: 24,
    paddingBottom: 20,
  },
});
