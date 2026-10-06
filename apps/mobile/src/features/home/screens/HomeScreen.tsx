import type { Home, HomeCategory, ProductSummary } from '@afrisime/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ErrorState, OfflineBanner, Screen, Skeleton } from '@/components/ui';
import { BannerCarousel } from '@/features/catalog/components/BannerCarousel';
import { CategoryTile } from '@/features/catalog/components/CategoryTile';
import { FlashCountdown } from '@/features/catalog/components/FlashCountdown';
import { ProductCardSkeleton } from '@/features/catalog/components/ProductCard';
import { ProductCarousel } from '@/features/catalog/components/ProductCarousel';
import { SearchEntry } from '@/features/catalog/components/SearchEntry';
import { useHome } from '@/features/catalog/hooks';
import { openAppLink, openProduct } from '@/lib/links';
import { useTheme } from '@/theme';

const logo = require('../../../../assets/brand/logo.webp') as number;

export function HomeScreen() {
  const theme = useTheme();
  const home = useHome();

  const onPressProduct = useCallback((p: ProductSummary) => openProduct(p.slug), []);
  const onPressCategory = useCallback(
    (c: HomeCategory) => router.push({ pathname: '/boutique', params: { category: c.slug } }),
    [],
  );
  const openShop = useCallback(() => router.push('/boutique'), []);

  return (
    <Screen padded={false}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }]}>
        <View
          style={[
            styles.logoWrap,
            { backgroundColor: theme.colors.logoBackground, borderRadius: theme.radius.md },
          ]}
        >
          <Image source={logo} style={styles.logo} contentFit="contain" accessibilityLabel="AfriSime" />
        </View>
        <SearchEntry onPress={openShop} />
      </View>
      <OfflineBanner updatedAt={home.dataUpdatedAt} />

      {home.data ? (
        <HomeContent
          home={home.data}
          refreshing={home.isRefetching}
          onRefresh={() => void home.refetch()}
          onPressProduct={onPressProduct}
          onPressCategory={onPressCategory}
        />
      ) : home.isError ? (
        <ErrorState error={home.error} onRetry={() => void home.refetch()} />
      ) : (
        <HomeSkeleton />
      )}
    </Screen>
  );
}

type ContentProps = {
  home: Home;
  refreshing: boolean;
  onRefresh: () => void;
  onPressProduct: (p: ProductSummary) => void;
  onPressCategory: (c: HomeCategory) => void;
};

function HomeContent({ home, refreshing, onRefresh, onPressProduct, onPressCategory }: ContentProps) {
  const theme = useTheme();
  return (
    <ScrollView
      contentContainerStyle={{ paddingVertical: theme.spacing.lg, gap: theme.spacing.xl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[theme.colors.primary]}
          tintColor={theme.colors.primary}
        />
      }
    >
      <BannerCarousel banners={home.banners} onPressBanner={(b) => openAppLink(b.link)} />

      {home.categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }}
          accessibilityLabel="Rayons"
        >
          {home.categories.map((c) => (
            <CategoryTile key={c.id} category={c} onPress={onPressCategory} />
          ))}
        </ScrollView>
      ) : null}

      {home.sections.map((s) => (
        <ProductCarousel
          key={s.id}
          title={s.title}
          products={s.items}
          onPressProduct={onPressProduct}
          onSeeAll={s.link ? () => openAppLink(s.link) : undefined}
          accessory={s.type === 'flash_sale' && s.endsAt ? <FlashCountdown endsAt={s.endsAt} /> : null}
        />
      ))}
    </ScrollView>
  );
}

function HomeSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.xl }} accessibilityLabel="Chargement">
      <Skeleton height={180} radius={theme.radius.lg} />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width={132} height={84} radius={theme.radius.lg} />
        ))}
      </View>
      <Skeleton width="45%" height={20} />
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        {[0, 1].map((i) => (
          <View key={i} style={{ width: 164 }}>
            <ProductCardSkeleton />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 8,
    paddingBottom: 12,
  },
  logoWrap: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  logo: {
    width: 134,
    height: 35,
  },
});
