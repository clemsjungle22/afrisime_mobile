import Ionicons from '@expo/vector-icons/Ionicons';
import type { PaymentMethodId } from '@afrisime/shared';
import { Image } from 'expo-image';
import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';

/**
 * Logos OFFICIELS des opérateurs Mobile Money (sources détaillées dans assets/payments/SOURCES.md).
 * - fill : l'image a son propre fond et remplit le cadre (icône d'application) ;
 * - contain : logo horizontal posé sur fond blanc avec une marge.
 */
const OFFICIAL_LOGOS: Partial<Record<PaymentMethodId, { source: number; fit: 'fill' | 'contain' }>> = {
  mixx: { source: require('../../../assets/payments/mixx.png') as number, fit: 'contain' },
  flooz: { source: require('../../../assets/payments/moov-money.png') as number, fit: 'fill' },
};

/** Moyens sans logo d'opérateur : pictogramme. */
const ICONS: Partial<Record<PaymentMethodId, ComponentProps<typeof Ionicons>['name']>> = {
  card: 'card',
  cash_on_delivery: 'cash',
  pay_at_agency: 'storefront',
};

type Props = {
  method: PaymentMethodId;
  size?: number;
};

/** Logo d'un moyen de paiement, format carré arrondi. */
export function PaymentLogo({ method, size = 44 }: Props) {
  const theme = useTheme();
  const official = OFFICIAL_LOGOS[method];
  const frame = {
    width: size,
    height: size,
    borderRadius: size * 0.26,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  };

  if (official) {
    const fill = official.fit === 'fill';
    return (
      <View
        style={[frame, fill ? null : { backgroundColor: '#ffffff', borderWidth: 1, borderColor: theme.colors.border }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Image
          source={official.source}
          style={fill ? { width: size, height: size } : { width: size * 0.84, height: size * 0.84 }}
          contentFit={fill ? 'cover' : 'contain'}
        />
      </View>
    );
  }

  return (
    <View
      style={[frame, { backgroundColor: theme.colors.primarySoft }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={ICONS[method] ?? 'wallet'} size={size * 0.48} color={theme.colors.onPrimarySoft} />
    </View>
  );
}
