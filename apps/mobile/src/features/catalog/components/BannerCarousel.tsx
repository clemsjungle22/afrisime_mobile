import type { HomeBanner } from '@afrisime/shared';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { ProductIllustration, type PackagingKind } from '@/components/illustrations/ProductIllustration';
import { Pattern, Text } from '@/components/ui';
import { gradients, palette, useTheme } from '@/theme';

type Props = {
  banners: HomeBanner[];
  onPressBanner: (banner: HomeBanner) => void;
};

const TONES: Record<HomeBanner['tone'], { colors: readonly [string, string]; fg: string; muted: string; overline: string; cta: string; ctaText: string; art: PackagingKind; artColor: string }> = {
  brand: {
    colors: gradients.brand,
    fg: palette.white,
    muted: palette.brand200,
    overline: palette.accent500,
    cta: palette.accent500,
    ctaText: palette.brand950,
    art: 'sack',
    artColor: palette.accent600,
  },
  accent: {
    colors: gradients.gold,
    fg: palette.brand950,
    muted: '#5b3a06',
    overline: palette.brand900,
    cta: palette.brand900,
    ctaText: palette.white,
    art: 'jerrycan',
    artColor: '#c2791b',
  },
  neutral: {
    colors: ['#2f6b2a', '#16391a'],
    fg: palette.white,
    muted: '#cfe6c2',
    overline: '#f6c978',
    cta: palette.white,
    ctaText: '#16391a',
    art: 'jar',
    artColor: '#4f8a2b',
  },
};

const OVERLINES: Record<HomeBanner['tone'], string> = {
  brand: 'AFRISIME · LOMÉ',
  accent: 'FORMATS PRO',
  neutral: 'MADE IN TOGO',
};

const AUTOPLAY_MS = 5500;

/** Bannières : dégradé, motif, illustration, défilement automatique doux (désactivé si animations réduites). */
export function BannerCarousel({ banners, onPressBanner }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const cardWidth = width - theme.spacing.lg * 2;
  const step = cardWidth + theme.spacing.md;
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollView>(null);
  const touching = useRef(false);

  useEffect(() => {
    if (reduceMotion || banners.length < 2) return;
    const id = setInterval(() => {
      if (touching.current) return;
      setIndex((i) => {
        const next = (i + 1) % banners.length;
        ref.current?.scrollTo({ x: next * step, animated: true });
        return next;
      });
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [reduceMotion, banners.length, step]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / step);
    if (i !== index) setIndex(i);
  };

  if (banners.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={step}
        snapToAlignment="start"
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }}
        onScroll={onScroll}
        onScrollBeginDrag={() => (touching.current = true)}
        onScrollEndDrag={() => (touching.current = false)}
        scrollEventThrottle={32}
      >
        {banners.map((b) => {
          const tone = TONES[b.tone];
          return (
            <Pressable
              key={b.id}
              onPress={() => onPressBanner(b)}
              accessibilityRole="button"
              accessibilityLabel={[b.title, b.subtitle, b.ctaLabel].filter(Boolean).join('. ')}
              style={[styles.banner, { width: cardWidth, borderRadius: theme.radius.xl, boxShadow: theme.shadows.md }]}
            >
              <LinearGradient colors={tone.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              {b.imageUrl ? (
                <Image source={{ uri: b.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
              ) : (
                <>
                  <Pattern color={tone.fg} opacity={0.08} size={30} />
                  <View style={styles.glow} />
                  <View style={styles.art}>
                    <ProductIllustration kind={tone.art} color={tone.artColor} size={150} />
                  </View>
                </>
              )}
              <View style={styles.text}>
                <Text variant="overline" style={{ color: tone.overline }}>
                  {OVERLINES[b.tone]}
                </Text>
                <Text variant="title" style={{ color: tone.fg, fontSize: 21, lineHeight: 26 }} numberOfLines={3}>
                  {b.title}
                </Text>
                {b.subtitle ? (
                  <Text variant="caption" style={{ color: tone.muted }} numberOfLines={2}>
                    {b.subtitle}
                  </Text>
                ) : null}
                {b.ctaLabel ? (
                  <View style={[styles.cta, { backgroundColor: tone.cta, borderRadius: theme.radius.pill }]}>
                    <Text variant="label" style={{ color: tone.ctaText, fontSize: 14 }}>
                      {b.ctaLabel}  →
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {banners.length > 1 ? (
        <View style={styles.dots} accessibilityLabel={`Bannière ${index + 1} sur ${banners.length}`}>
          {banners.map((b, i) => (
            <View
              key={b.id}
              style={[
                styles.dot,
                { width: i === index ? 22 : 7, backgroundColor: i === index ? theme.colors.primary : theme.colors.border },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 214,
    overflow: 'hidden',
  },
  glow: {
    zIndex: 0,
    position: 'absolute',
    right: -30,
    top: 10,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#ffffff',
    opacity: 0.12,
  },
  art: {
    zIndex: 1,
    position: 'absolute',
    right: -12,
    bottom: -6,
    transform: [{ rotate: '-8deg' }],
  },
  text: {
    zIndex: 2,
    flex: 1,
    width: '66%',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 5,
    justifyContent: 'center',
  },
  cta: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
});
