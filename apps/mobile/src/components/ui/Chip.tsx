import { Pressable } from 'react-native';
import { minTouchSize, useTheme } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/** Puce sélectionnable (rayons, filtres). Zone tactile ≥ 48 dp grâce au hitSlop. */
export function Chip({ label, selected, onPress }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: (minTouchSize - 36) / 2, bottom: (minTouchSize - 36) / 2 }}
      style={({ pressed }) => ({
        height: 36,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected
          ? theme.colors.primary
          : pressed
            ? theme.colors.surfaceAlt
            : theme.colors.surface,
      })}
    >
      <Text variant="caption" color={selected ? 'onPrimary' : 'text'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
