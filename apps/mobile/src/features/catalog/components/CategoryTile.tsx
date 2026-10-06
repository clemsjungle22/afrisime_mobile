import type { HomeCategory } from '@afrisime/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { palette, useTheme } from '@/theme';

type Props = {
  category: HomeCategory;
  onPress: (category: HomeCategory) => void;
};

/** Tuile de rayon aux couleurs du site. */
export function CategoryTile({ category, onPress }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Rayon ${category.name}`}
      onPress={() => onPress(category)}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: category.color,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[StyleSheet.absoluteFill, styles.shade]} />
      <Text variant="label" style={styles.label} numberOfLines={2}>
        {category.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 132,
    height: 84,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  shade: {
    top: '50%',
    backgroundColor: palette.brand950,
    opacity: 0.3,
  },
  label: {
    color: palette.white,
  },
});
