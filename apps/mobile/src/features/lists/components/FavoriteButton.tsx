import Ionicons from '@expo/vector-icons/Ionicons';
import type { ProductSummary } from '@afrisime/shared';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { isApiError } from '@/api/errors';
import { useSession } from '@/features/auth/session';
import { haptics } from '@/lib/haptics';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { useFavoriteIds, useToggleFavorite } from '../hooks';

type Props = {
  product: ProductSummary;
  /** `card` : petit cœur sur une carte produit ; `round` : bouton rond de la fiche produit. */
  appearance?: 'card' | 'round';
};

/** Cœur des favoris : change tout de suite, enregistré sur le compte (visiteur : connexion demandée). */
export function FavoriteButton({ product, appearance = 'card' }: Props) {
  const theme = useTheme();
  const authenticated = useSession((s) => s.status === 'authenticated');
  const favorite = useFavoriteIds().has(product.id);
  const toggle = useToggleFavorite();
  const round = appearance === 'round';

  const onPress = () => {
    if (!authenticated) {
      showSnackbar({
        message: 'Connectez-vous pour garder vos produits favoris.',
        actionLabel: 'Se connecter',
        onAction: () => router.push('/login'),
      });
      return;
    }
    haptics.select();
    toggle.mutate(
      { product, on: !favorite },
      {
        onError: (error) =>
          showSnackbar({
            message: isApiError(error) && !error.isNetwork ? error.message : 'Favori non enregistré : vérifiez votre connexion.',
          }),
      },
    );
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: favorite }}
      accessibilityLabel={favorite ? `Retirer ${product.name} des favoris` : `Ajouter ${product.name} aux favoris`}
      style={({ pressed }) => [
        round ? styles.round : styles.card,
        {
          backgroundColor: round ? theme.colors.surface : 'rgba(255,255,255,0.92)',
          boxShadow: round ? theme.shadows.md : theme.shadows.sm,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons
        name={favorite ? 'heart' : 'heart-outline'}
        size={round ? 22 : 18}
        color={favorite ? theme.colors.error : theme.colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
