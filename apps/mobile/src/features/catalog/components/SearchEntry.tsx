import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';
import { Text } from '@/components/ui';
import { minTouchSize, useTheme } from '@/theme';

/** Point d'entrée de la recherche (l'écran de recherche arrive avec US-003). */
export function SearchEntry({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Rechercher un produit"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        minHeight: minTouchSize,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
      })}
    >
      <Ionicons name="search" size={20} color={theme.colors.textMuted} />
      <Text color="textMuted" numberOfLines={1}>
        Riz, huile, gari, savon…
      </Text>
    </Pressable>
  );
}
