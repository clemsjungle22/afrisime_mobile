import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { fontFamilies, minTouchSize, useTheme } from '@/theme';
import { Text } from './Text';

type Props = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
};

/** Champ de formulaire : libellé visible, erreur annoncée, zone tactile ≥ 48 dp. */
export const TextField = forwardRef<TextInput, Props>(function TextField({ label, error, hint, style, ...rest }, ref) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={theme.colors.onDisabled}
        style={[
          {
            minHeight: minTouchSize + 4,
            paddingHorizontal: theme.spacing.md,
            borderWidth: error ? 2 : 1,
            borderRadius: theme.radius.md,
            borderColor: error ? theme.colors.error : theme.colors.border,
            backgroundColor: theme.colors.surface,
            color: theme.colors.text,
            fontFamily: fontFamilies.medium,
            fontSize: 16,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" color="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
