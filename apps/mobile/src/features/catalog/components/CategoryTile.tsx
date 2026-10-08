import type { HomeCategory } from '@afrisime/shared';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pattern, PressableScale, Text } from '@/components/ui';
import { mediaUri } from '@/lib/media';
import { palette, shade, tint, useTheme } from '@/theme';

type Props = {
  category: HomeCategory;
  onPress: (category: HomeCategory) => void;
  size: number;
};

/** Tuile de rayon : photo du rayon si disponible, sinon dégradé du rayon et motif « artisanal » ; nom. */
export function CategoryTile({ category, onPress, size }: Props) {
  const theme = useTheme();
  const uri = mediaUri(category.imageUrl);
  const [failed, setFailed] = useState(false);
  const photo = uri !== null && !failed;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Rayon ${category.name}`}
      onPress={() => onPress(category)}
      style={{
        width: size,
        height: size * 1.08,
        borderRadius: theme.radius.lg,
        boxShadow: theme.shadows.sm,
      }}
    >
      <View style={[styles.inner, { borderRadius: theme.radius.lg }]}>
        {photo ? (
          <>
            <Image
              source={{ uri }}
              onError={() => setFailed(true)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessibilityIgnoresInvertColors
            />
            {/* Voile sombre en bas : le nom reste lisible quelle que soit la photo. */}
            <LinearGradient
              colors={['transparent', shade(category.color, 0.55)]}
              locations={[0.35, 1]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          <>
            <LinearGradient
              colors={[tint(category.color, 0.12), shade(category.color, 0.38)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Pattern color="#ffffff" opacity={0.08} size={26} />
          </>
        )}
        <Text variant="label" style={styles.label} numberOfLines={2}>
          {category.name}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  inner: {
    flex: 1,
    overflow: 'hidden',
    padding: 10,
    justifyContent: 'flex-end',
  },
  label: {
    color: palette.white,
    fontSize: 16,
    lineHeight: 19,
  },
});
