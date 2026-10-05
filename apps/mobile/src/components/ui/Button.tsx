import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { minTouchSize, useTheme, type ColorTokens } from '@/theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  size?: Size;
  /** Désactive le bouton et affiche un indicateur (ex. envoi d'un paiement). */
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const variantColors: Record<
  Variant,
  { bg: keyof ColorTokens; bgPressed: keyof ColorTokens; fg: keyof ColorTokens; border?: keyof ColorTokens }
> = {
  primary: { bg: 'primary', bgPressed: 'primaryPressed', fg: 'onPrimary' },
  secondary: { bg: 'primarySoft', bgPressed: 'surfaceAlt', fg: 'onPrimarySoft', border: 'border' },
  ghost: { bg: 'background', bgPressed: 'surfaceAlt', fg: 'primary' },
  danger: { bg: 'error', bgPressed: 'error', fg: 'textInverse' },
};

const heights: Record<Size, number> = { md: minTouchSize, lg: 56 };

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  fullWidth = false,
  icon,
  style,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled === true || loading;
  const v = variantColors[variant];
  const fg = isDisabled ? 'onDisabled' : v.fg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      android_ripple={{ color: theme.colors.surfaceAlt }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: heights[size],
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.xl,
          backgroundColor: isDisabled
            ? theme.colors.disabled
            : theme.colors[pressed ? v.bgPressed : v.bg],
          borderColor: v.border ? theme.colors[v.border] : 'transparent',
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors[fg]} />
      ) : (
        <View style={[styles.content, { gap: theme.spacing.sm }]}>
          {icon}
          <Text variant="label" color={fg} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
