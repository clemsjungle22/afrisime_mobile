import Ionicons from '@expo/vector-icons/Ionicons';
import type { PaymentMethodId } from '@afrisime/shared';
import { Image } from 'expo-image';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { fontFamilies, palette, useTheme } from '@/theme';
import { Text } from './Text';

/**
 * Logos OFFICIELS des moyens de paiement, à fournir par AfriSime / le PSP (kits marchands
 * Yas et Moov Africa). Pour en activer un : déposer le fichier dans assets/payments/ puis
 * l'ajouter ici, ex. `mixx: require('../../../assets/payments/mixx.png')`.
 * Tant qu'un logo manque, un badge sobre (sans couleurs de marque inventées) est affiché.
 */
const OFFICIAL_LOGOS: Partial<Record<PaymentMethodId, number>> = {};

const WORDMARKS: Partial<Record<PaymentMethodId, { top: string; bottom?: string }>> = {
  mixx: { top: 'mixx', bottom: 'by Yas' },
  flooz: { top: 'Flooz', bottom: 'Moov Africa' },
};

const ICONS: Partial<Record<PaymentMethodId, ComponentProps<typeof Ionicons>['name']>> = {
  card: 'card',
  cash_on_delivery: 'cash',
  pay_at_agency: 'storefront',
};

type Props = {
  method: PaymentMethodId;
  size?: number;
};

/** Logo (ou badge) d'un moyen de paiement, format carré arrondi. */
export function PaymentLogo({ method, size = 44 }: Props) {
  const theme = useTheme();
  const official = OFFICIAL_LOGOS[method];
  const frame = {
    width: size,
    height: size,
    borderRadius: size * 0.28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  };

  if (official) {
    return (
      <View style={frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={official} style={{ width: size * 0.82, height: size * 0.82 }} contentFit="contain" />
      </View>
    );
  }

  const word = WORDMARKS[method];
  if (word) {
    return (
      <View style={frame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text
          maxFontSizeMultiplier={1}
          style={{ fontFamily: fontFamilies.extrabold, fontSize: size * 0.27, lineHeight: size * 0.31, color: palette.ink, letterSpacing: -0.3 }}
        >
          {word.top}
        </Text>
        {word.bottom ? (
          <Text maxFontSizeMultiplier={1} style={{ fontFamily: fontFamilies.semibold, fontSize: size * 0.15, lineHeight: size * 0.18, color: palette.muted }}>
            {word.bottom}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[frame, { backgroundColor: theme.colors.primarySoft, borderColor: 'transparent' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Ionicons name={ICONS[method] ?? 'wallet'} size={size * 0.48} color={theme.colors.onPrimarySoft} />
    </View>
  );
}
