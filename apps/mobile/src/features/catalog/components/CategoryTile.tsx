import type { HomeCategory } from '@afrisime/shared';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { Pattern, PressableScale, Text } from '@/components/ui';
import { palette, shade, tint, useTheme } from '@/theme';

type Props = {
  category: HomeCategory;
  onPress: (category: HomeCategory) => void;
  size: number;
};

/** Tuile de rayon : dégradé du rayon, motif « artisanal », nom. */
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
