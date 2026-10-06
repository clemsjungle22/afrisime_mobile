import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { minTouchSize, useTheme } from '@/theme';
import { Text } from './Text';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texte (peut contenir des liens). */
  children: ReactNode;
  accessibilityLabel: string;
  error?: string;
};

export function Checkbox({ checked, onChange, children, accessibilityLabel, error }: Props) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={accessibilityLabel}
        onPress={() => onChange(!checked)}
        style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, minHeight: minTouchSize, paddingVertical: theme.spacing.xs }}
      >
        <View
          style={{
            width: 24,
            height: 24,
            marginTop: 1,
            borderRadius: 6,
            borderWidth: 2,
            alignItems: 'center',
            justifyContent: 'center',
            borderColor: error ? theme.colors.error : checked ? theme.colors.primary : theme.colors.border,
            backgroundColor: checked ? theme.colors.primary : theme.colors.surface,
          }}
        >
          {checked ? <Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} /> : null}
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </Pressable>
      {error ? (
        <Text variant="caption" color="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
