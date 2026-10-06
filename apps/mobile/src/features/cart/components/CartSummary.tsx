import { formatFCFA } from '@afrisime/shared';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme';

type Props = {
  itemCount: number;
  /** Total serveur à jour, ou null si en cours de calcul / hors ligne. */
  serverTotal: number | null;
  /** Estimation à partir des prix indicatifs (affichée seulement sans total serveur). */
  estimate: number;
  calculating: boolean;
  offline: boolean;
  checkoutDisabled: boolean;
  checkoutLoading: boolean;
  onCheckout: () => void;
  /** Hauteur de la barre d'onglets à éviter (l'écran Panier est un onglet). */
  bottomInset?: number;
};

export function CartSummary({
  itemCount,
  serverTotal,
  estimate,
  calculating,
  offline,
  checkoutDisabled,
  checkoutLoading,
  onCheckout,
  bottomInset,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const showServer = serverTotal !== null;

  return (
    <View
      style={[
        styles.bar,
        {
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: bottomInset ?? Math.max(insets.bottom, theme.spacing.md),
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        <Text color="textMuted">
          Sous-total ({itemCount} article{itemCount > 1 ? 's' : ''})
        </Text>
        <View style={[styles.row, { gap: theme.spacing.sm }]}>
          {calculating ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
          <Text
            variant="price"
            color={showServer ? 'text' : 'textMuted'}
            accessibilityLabel={
              showServer ? `Sous-total ${formatFCFA(serverTotal)}` : `Estimation ${formatFCFA(estimate)}, à confirmer`
            }
          >
            {showServer ? formatFCFA(serverTotal) : `≈ ${formatFCFA(estimate)}`}
          </Text>
        </View>
      </View>
      <Text variant="caption" color="textMuted">
        {offline
          ? 'Hors connexion : prix indicatifs, confirmés dès le retour du réseau.'
          : showServer
            ? 'Frais de livraison calculés à l’étape suivante.'
            : 'Vérification des prix et du stock…'}
      </Text>
      <Button
        label={offline ? 'Connexion requise pour commander' : 'Passer la commande'}
        size="lg"
        fullWidth
        disabled={checkoutDisabled}
        loading={checkoutLoading}
        onPress={onCheckout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
