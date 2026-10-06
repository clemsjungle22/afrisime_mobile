import type { HomeBanner } from '@afrisime/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Button, Text } from '@/components/ui';
import { palette, useTheme, type ColorTokens } from '@/theme';

type Props = {
  banners: HomeBanner[];
  onPressBanner: (banner: HomeBanner) => void;
};

const toneColors: Record<HomeBanner['tone'], { bg: string; fg: string; muted: string }> = {
  brand: { bg: palette.brand900, fg: palette.white, muted: palette.brand200 },
  accent: { bg: palette.accent500, fg: palette.brand950, muted: palette.brand900 },
  neutral: { bg: palette.brand100, fg: palette.brand950, muted: palette.brand700 },
};

const ctaVariant: Record<HomeBanner['tone'], 'secondary' | 'primary'> = {
  brand: 'secondary',
  accent: 'primary',
  neutral: 'primary',
};

/** Bannières défilantes (peu nombreuses : ScrollView paginé suffit). */
export function BannerCarousel({ banners, onPressBanner }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = width - theme.spacing.lg * 2;
  const [index, setIndex] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + theme.spacing.md));
    if (i !== index) setIndex(i);
  };

  if (banners.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth + theme.spacing.md}
        snapToAlignment="start"
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {banners.map((b) => {
          const tone = toneColors[b.tone];
          return (
            <View
              key={b.id}
              style={[
                styles.banner,
                {
                  width: cardWidth,
                  backgroundColor: tone.bg,
                  borderRadius: theme.radius.lg,
                  padding: theme.spacing.xl,
                  gap: theme.spacing.sm,
                },
              ]}
            >
              {b.imageUrl ? (
                <Image
                  source={{ uri: b.imageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  accessible={false}
                />
              ) : null}
              <Text variant="title" style={{ color: tone.fg }} numberOfLines={2}>
                {b.title}
              </Text>
              {b.subtitle ? (
                <Text variant="body" style={{ color: tone.muted }} numberOfLines={2}>
                  {b.subtitle}
                </Text>
              ) : null}
              {b.ctaLabel && b.link ? (
                <Button
                  label={b.ctaLabel}
                  variant={ctaVariant[b.tone]}
                  onPress={() => onPressBanner(b)}
                  style={styles.cta}
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      {banners.length > 1 ? <Dots count={banners.length} active={index} colors={theme.colors} /> : null}
    </View>
  );
}

function Dots({ count, active, colors }: { count: number; active: number; colors: ColorTokens }) {
  return (
    <View
      style={styles.dots}
      accessibilityLabel={`Bannière ${active + 1} sur ${count}`}
      accessibilityRole="text"
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              width: i === active ? 18 : 6,
              backgroundColor: i === active ? colors.primary : colors.border,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 180,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
});
