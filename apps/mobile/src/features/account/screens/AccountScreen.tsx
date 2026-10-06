import { View } from 'react-native';
import { apiConfig } from '@/api/config';
import { useMockScenarios } from '@/api/mock/scenarios';
import { Badge, Button, Screen, Text } from '@/components/ui';
import { useCart } from '@/features/cart/store';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';

export function AccountScreen() {
  const theme = useTheme();
  return (
    <Screen scroll>
      <Text variant="display" accessibilityRole="header">
        Compte
      </Text>
      <Text color="textMuted" style={{ marginTop: theme.spacing.sm }}>
        Profil, crédit, carnets, fidélité et sécurité arrivent avec la connexion.
      </Text>
      {apiConfig.mock ? <DemoTools /> : null}
    </Screen>
  );
}

/** Outils du mode démo (données simulées) : absents quand l'app parle au vrai backend. */
function DemoTools() {
  const theme = useTheme();
  const armed = useMockScenarios((s) => s.cartChangeArmed);
  const overrides = useMockScenarios((s) => s.overrides);
  const arm = useMockScenarios((s) => s.armCartChange);
  const reset = useMockScenarios((s) => s.reset);
  const clearCart = useCart((s) => s.clear);
  const active = overrides.prices.size + overrides.stock.size + overrides.unavailable.size > 0;

  return (
    <View
      style={{
        marginTop: theme.spacing.xxl,
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Text variant="subtitle">Mode démo</Text>
        <Badge label="Données simulées" tone="warning" />
      </View>

      <Text variant="bodyStrong">Panier modifié par le serveur</Text>
      <Text variant="caption" color="textMuted">
        Au prochain contrôle du panier : +10 % sur le 1er article, stock réduit sur le 2e, rupture sur le 3e.
        Ajoutez au moins 3 articles pour voir les trois cas.
      </Text>
      <Button
        label={armed ? 'Scénario armé — ouvrez le panier' : 'Simuler un panier modifié'}
        variant="secondary"
        disabled={armed}
        onPress={() => {
          arm();
          showSnackbar({ message: 'Ouvrez le panier pour voir les changements.' });
        }}
      />
      {active || armed ? (
        <Button label="Revenir aux prix et stocks normaux" variant="ghost" onPress={reset} />
      ) : null}

      <Button
        label="Vider le panier"
        variant="ghost"
        onPress={() => {
          clearCart();
          showSnackbar({ message: 'Panier vidé.' });
        }}
      />
    </View>
  );
}
