import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, type ColorTokens } from '@/theme';
import { Text } from './Text';

export type BadgeTone = 'brand' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

const tones: Record<BadgeTone, { bg: keyof ColorTokens; fg: keyof ColorTokens }> = {
  brand: { bg: 'primary', fg: 'onPrimary' },
  accent: { bg: 'accent', fg: 'onAccent' },
  success: { bg: 'successSoft', fg: 'success' },
  warning: { bg: 'warningSoft', fg: 'warning' },
  error: { bg: 'errorSoft', fg: 'error' },
  info: { bg: 'infoSoft', fg: 'info' },
  neutral: { bg: 'surfaceAlt', fg: 'textMuted' },
};

export function Badge({
  label,
  tone = 'neutral',
  style,
}: {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const t = tones[tone];
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 2,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors[t.bg],
        },
        style,
      ]}
    >
      <Text variant="micro" color={t.fg} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
}
