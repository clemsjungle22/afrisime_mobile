import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA } from '@afrisime/shared';
import { router } from 'expo-router';
import { View } from 'react-native';
import { PressableScale, Text } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { countItems, estimateSubtotal, useCart } from '../store';

/**
 * Bouton « Suivant » toujours visible dès qu'il y a un article dans le panier : le client n'a jamais à
 * chercher le panier pour continuer sa commande.
 */
export function CartNextButton({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  const count = useCart((s) => countItems(s.lines));
  const subtotal = useCart((s) => estimateSubtotal(s.lines));
  if (count <= 0) return null;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Suivant : voir le panier, ${count} article${count > 1 ? 's' : ''}, environ ${formatFCFA(subtotal)}`}
      onPress={() => {
        haptics.tap();
        router.navigate('/panier');
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: compact ? theme.spacing.sm : theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.accent,
        boxShadow: theme.shadows.lg,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flex: 1 }}>
        <Ionicons name="cart" size={20} color={theme.colors.onAccent} />
        <Text variant="bodyStrong" style={{ color: theme.colors.onAccent }} numberOfLines={1}>
          {count} article{count > 1 ? 's' : ''} · {formatFCFA(subtotal)}
        </Text>
      </View>
      <Text variant="bodyStrong" style={{ color: theme.colors.onAccent }}>
        Suivant
      </Text>
      <Ionicons name="arrow-forward" size={20} color={theme.colors.onAccent} />
    </PressableScale>
  );
}
