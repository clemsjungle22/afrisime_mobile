import type { HomeCategory } from '@afrisime/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { ProductIllustration, type PackagingKind } from '@/components/illustrations/ProductIllustration';
import { Pattern, PressableScale, Text } from '@/components/ui';
import { palette, shade, tint, useTheme } from '@/theme';

/** Illustration emblématique de chaque rayon (repli : sac). */
const KIND_BY_CATEGORY: Record<string, PackagingKind> = {
  epicerie: 'can',
  boissons: 'bottle',
  'cereales-farines': 'sack',
  huiles: 'jerrycan',
  'produits-locaux': 'jar',
  'hygiene-entretien': 'bar',
};

type Props = {
  category: HomeCategory;
  onPress: (category: HomeCategory) => void;
  size: number;
};

/** Tuile de rayon : dégradé du rayon, motif, illustration, nom. */
export function CategoryTile({ category, onPress, size }: Props) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Rayon ${category.name}`}
      onPress={() => onPress(category)}
      style={{ width: size, height: size * 1.08, borderRadius: theme.radius.lg, boxShadow: theme.shadows.sm }}
    >
      <View style={[styles.inner, { borderRadius: theme.radius.lg }]}>
        <LinearGradient
          colors={[tint(category.color, 0.12), shade(category.color, 0.38)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Pattern color="#ffffff" opacity={0.08} size={26} />
        <View style={styles.art}>
          <ProductIllustration kind={KIND_BY_CATEGORY[category.slug] ?? 'sack'} color={category.color} size={size * 0.62} />
        </View>
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
  art: {
    position: 'absolute',
    top: 4,
    right: -6,
  },
  label: {
    color: palette.white,
    fontSize: 14,
    lineHeight: 17,
  },
});
