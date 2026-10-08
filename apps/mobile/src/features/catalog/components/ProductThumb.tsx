import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Pattern, Text } from '@/components/ui';
import { mediaUri } from '@/lib/media';
import { fontFamilies, palette, shade, tint } from '@/theme';

type Props = {
  name: string;
  imageUrl: string | null;
  /** Couleur du rayon : fond et initiales. */
  color: string;
  /** soft : fond pastel (cartes, listes) ; vivid : dégradé du rayon (en-tête de fiche). */
  variant?: 'soft' | 'vivid';
};

/** Deux initiales significatives : « Riz parfumé long grain » → « RP ». */
export function productInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length > 2);
  const picked = words.length > 0 ? words : name.split(/\s+/).filter(Boolean);
  return picked
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * Visuel produit : photo si disponible (cache disque), sinon initiales du produit
 * sur le fond « artisanal » (dégradé du rayon + motif kente/wax).
 */
export function ProductThumb({ name, imageUrl, color, variant = 'soft' }: Props) {
  const [size, setSize] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(Math.min(width, height));
  };

  const uri = mediaUri(imageUrl);
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        style={styles.fill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        accessibilityIgnoresInvertColors
        accessibilityLabel={name}
      />
    );
  }

  const vivid = variant === 'vivid';
  const colors = vivid
    ? ([tint(color, 0.08), shade(color, 0.42)] as const)
    : ([tint(color, 0.9), tint(color, 0.74)] as const);
  const fontSize = Math.max(14, size * (vivid ? 0.28 : 0.3));

  return (
    <View
      style={styles.fill}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {vivid ? (
        <Pattern color="#ffffff" opacity={0.09} size={34} />
      ) : (
        <Pattern color={color} opacity={0.08} size={28} />
      )}
      {size > 0 ? (
        <View style={styles.center}>
          <View
            style={{
              position: 'absolute',
              width: size * (vivid ? 0.5 : 0.62),
              height: size * (vivid ? 0.5 : 0.62),
              borderRadius: size,
              backgroundColor: '#ffffff',
              opacity: vivid ? 0.16 : 0.6,
              zIndex: 0,
            }}
          />
          {/* zIndex explicite : les initiales toujours AU-DESSUS du halo (web compris). */}
          <Text
            maxFontSizeMultiplier={1}
            style={{
              zIndex: 1,
              fontFamily: fontFamilies.extrabold,
              fontSize,
              lineHeight: fontSize * 1.15,
              letterSpacing: -fontSize * 0.03,
              color: vivid ? palette.white : shade(color, 0.3),
            }}
          >
            {productInitials(name)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
