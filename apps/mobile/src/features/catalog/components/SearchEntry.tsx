import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';
import { minTouchSize, useTheme } from '@/theme';

type Props = {
  onPress: () => void;
  /** Version flottante (posée à cheval sur un en-tête), avec ombre. */
  elevated?: boolean;
};

/** Point d'entrée de la recherche. */
export function SearchEntry({ onPress, elevated = false }: Props) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel="Rechercher un produit"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: elevated ? 58 : minTouchSize + 4,
        paddingLeft: theme.spacing.lg,
        paddingRight: 6,
        borderRadius: theme.radius.pill,
        borderWidth: elevated ? 0 : 1,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
        boxShadow: elevated ? theme.shadows.lg : undefined,
      })}
    >
      <Ionicons name="search" size={21} color={theme.colors.primary} />
      <Text color="textMuted" numberOfLines={1} style={{ flex: 1 }}>
        Riz, huile, gari, savon…
      </Text>
      {elevated ? (
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.primary,
          }}
        >
          <Ionicons name="options-outline" size={20} color={theme.colors.onPrimary} />
        </View>
      ) : null}
    </Pressable>
  );
}
