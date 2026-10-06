import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { minTouchSize, useTheme } from '@/theme';

type Props = {
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

/** Sélecteur de quantité (entiers, borné par le minimum de commande). */
export function QuantityStepper({ value, min, max = 999, onChange, disabled = false }: Props) {
  const theme = useTheme();
  const canDec = !disabled && value > min;
  const canInc = !disabled && value < max;

  const button = (icon: 'remove' | 'add', enabled: boolean, next: number, label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={() => onChange(next)}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={enabled ? theme.colors.primary : theme.colors.onDisabled} />
    </Pressable>
  );

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Quantité"
      accessibilityValue={{ now: value, min, max }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment' && canInc) onChange(value + 1);
        if (e.nativeEvent.actionName === 'decrement' && canDec) onChange(value - 1);
      }}
      style={[
        styles.container,
        { borderColor: theme.colors.border, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface },
      ]}
    >
      {button('remove', canDec, value - 1, 'Diminuer la quantité')}
      <Text variant="subtitle" style={styles.value}>
        {value}
      </Text>
      {button('add', canInc, value + 1, 'Augmenter la quantité')}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  btn: {
    width: minTouchSize,
    height: minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 36,
    textAlign: 'center',
  },
});
