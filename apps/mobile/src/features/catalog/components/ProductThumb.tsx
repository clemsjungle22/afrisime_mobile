import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { palette } from '@/theme';

type Props = {
  name: string;
  imageUrl: string | null;
  /** Couleur du rayon, utilisée quand il n'y a pas de photo. */
  color: string;
  size?: 'sm' | 'md' | 'lg';
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const fontSizes = { sm: 18, md: 28, lg: 56 } as const;

/** Photo produit (cache disque) ou vignette aux couleurs du rayon, comme les tuiles du site. */
export function ProductThumb({ name, imageUrl, color, size = 'md' }: Props) {
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={styles.fill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    );
  }
  return (
    <View
      style={[styles.fill, styles.placeholder, { backgroundColor: color }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[StyleSheet.absoluteFill, styles.shade]} />
      <Text
        style={{ color: palette.white, fontSize: fontSizes[size], lineHeight: fontSizes[size] * 1.2 }}
        variant="display"
        maxFontSizeMultiplier={1}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shade: {
    // Rappel du dégradé du site (couleur du rayon → vert très sombre), sans dépendance de gradient.
    top: '55%',
    backgroundColor: palette.brand950,
    opacity: 0.25,
  },
});
