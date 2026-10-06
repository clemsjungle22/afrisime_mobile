import { Pressable, View } from 'react-native';
import { minTouchSize, useTheme } from '@/theme';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Choix entre 2–3 options exclusives (ex. Livraison / Retrait). */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        padding: 4,
        gap: 4,
        borderRadius: theme.radius.md + 4,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: minTouchSize,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.md,
              backgroundColor: selected ? theme.colors.surface : 'transparent',
              borderWidth: selected ? 1 : 0,
              borderColor: theme.colors.border,
            }}
          >
            <Text variant="label" color={selected ? 'primary' : 'textMuted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
