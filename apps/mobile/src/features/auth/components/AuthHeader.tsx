import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { minTouchSize, useTheme } from '@/theme';

type Props = {
  /** 'back' : retour à l'étape précédente ; 'close' : quitter le parcours de connexion. */
  action?: 'back' | 'close';
  onPress?: () => void;
};

/** Ferme tout le parcours de connexion et revient là où l'utilisateur était. */
export function closeAuthFlow(): void {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

export function AuthHeader({ action = 'back', onPress }: Props) {
  const theme = useTheme();
  const handle = onPress ?? (action === 'close' ? closeAuthFlow : () => router.back());
  return (
    <View style={[styles.row, { paddingHorizontal: theme.spacing.sm }]}>
      <Pressable
        onPress={handle}
        accessibilityRole="button"
        accessibilityLabel={action === 'close' ? 'Fermer' : 'Retour'}
        style={styles.button}
      >
        <Ionicons name={action === 'close' ? 'close' : 'arrow-back'} size={24} color={theme.colors.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchSize + 8,
  },
  button: {
    width: minTouchSize,
    height: minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
