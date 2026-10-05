import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

export type TextProps = RNTextProps & {
  variant?: TypographyVariant;
  color?: keyof ColorTokens;
  align?: 'left' | 'center' | 'right';
};

/** Texte du design system. Respecte la taille de police système (plafonnée pour garder la mise en page). */
export function Text({
  variant = 'body',
  color = 'text',
  align,
  style,
  maxFontSizeMultiplier = 1.6,
  ...rest
}: TextProps) {
  const theme = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
