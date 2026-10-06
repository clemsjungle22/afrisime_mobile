import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA, type CartChange } from '@afrisime/shared';
import { View } from 'react-native';
import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme';

/** Phrase compréhensible pour un changement serveur. */
export function describeChange(c: CartChange): string {
  const what = c.variantLabel ? `${c.productName} (${c.variantLabel})` : c.productName;
  switch (c.type) {
    case 'price_changed':
      if (c.newPrice === null) return `${what} : le prix n'est plus disponible.`;
      if (c.oldPrice === null) return `${what} : prix désormais ${formatFCFA(c.newPrice)}.`;
      return `${what} : ${formatFCFA(c.oldPrice)} → ${formatFCFA(c.newPrice)}${c.newPrice < c.oldPrice ? ' (baisse)' : ''}.`;
    case 'quantity_reduced':
      return `${what} : stock insuffisant, quantité ramenée de ${c.oldQuantity ?? '?'} à ${c.newQuantity ?? 0}.`;
    case 'unavailable':
      return `${what} : n'est plus disponible pour le moment.`;
    case 'removed':
      return `${what} : retiré de votre panier.`;
  }
}

type Props = {
  changes: CartChange[];
  onAcknowledge: () => void;
};

/** « Votre panier a changé » (RB-002) : le détail, puis confirmation explicite. */
export function CartChangedNotice({ changes, onAcknowledge }: Props) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.warningSoft,
        borderWidth: 1,
        borderColor: theme.colors.warning,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Ionicons name="alert-circle" size={22} color={theme.colors.warning} />
        <Text variant="subtitle" color="warning">
          Votre panier a changé
        </Text>
      </View>
      {changes.map((c) => (
        <Text key={`${c.type}:${c.variantId}`} variant="body" color="text">
          • {describeChange(c)}
        </Text>
      ))}
      <Text variant="caption" color="textMuted">
        Les prix et le stock sont vérifiés en temps réel. Le total ci-dessous est à jour.
      </Text>
      <Button label="J'ai compris" variant="secondary" onPress={onAcknowledge} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}
