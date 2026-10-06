import { Pressable } from 'react-native';
import { minTouchSize, useTheme } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 'tab' pour une navigation (rayons), 'checkbox' pour un filtre. */
  role?: 'tab' | 'checkbox';
  disabled?: boolean;
};

const HEIGHT = 36;

/** Puce sélectionnable (rayons, filtres). Zone tactile ≥ 48 dp grâce au hitSlop. */
export function Chip({ label, selected, onPress, role = 'tab', disabled = false }: Props) {
  const theme = useTheme();
  const slop = (minTouchSize - HEIGHT) / 2;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'tab' ? { selected, disabled } : { checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop }}
      style={({ pressed }) => ({
        height: HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        opacity: disabled ? 0.45 : 1,
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
