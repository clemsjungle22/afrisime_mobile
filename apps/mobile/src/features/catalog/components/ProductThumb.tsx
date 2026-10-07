import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { packagingKind, ProductIllustration } from '@/components/illustrations/ProductIllustration';
import { Pattern } from '@/components/ui';
import { shade, tint } from '@/theme';

type Props = {
  name: string;
  imageUrl: string | null;
  /** Couleur du rayon : fond et étiquettes de l'illustration. */
  color: string;
  /** Conditionnement ou libellé du format (« Sac 5 kg ») : choisit l'illustration. */
  packaging?: string;
  /**
   * soft : fond pastel (cartes, listes) ; vivid : dégradé du rayon + motif (en-tête de fiche).
   */
  variant?: 'soft' | 'vivid';
  /** Proportion de l'illustration dans le cadre. */
  scale?: number;
};

/**
 * Visuel produit : photo si disponible (cache disque), sinon illustration vectorielle
 * du conditionnement sur fond aux couleurs du rayon.
 */
export function ProductThumb({ name, imageUrl, color, packaging, variant = 'soft', scale = 0.86 }: Props) {
  const [size, setSize] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(Math.min(width, height));
  };

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
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

  return (
    <View style={styles.fill} onLayout={onLayout} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {vivid ? <Pattern color="#ffffff" opacity={0.09} size={34} /> : <Pattern color={color} opacity={0.07} size={28} />}
      {size > 0 ? (
        <View style={styles.center}>
          <View
            style={{
              position: 'absolute',
              width: size * 0.72,
              height: size * 0.72,
              borderRadius: size,
              backgroundColor: '#ffffff',
              opacity: vivid ? 0.16 : 0.5,
              zIndex: 0,
            }}
          />
          {/* zIndex explicite : l'illustration toujours AU-DESSUS du halo (web compris). */}
          <View style={{ zIndex: 1 }}>
            <ProductIllustration kind={packagingKind(packaging ?? 'sac')} color={color} size={size * scale} />
          </View>
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
