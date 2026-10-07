import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SceneIllustration } from '@/components/illustrations/SceneIllustration';
import { FadeIn, Pattern, Text } from '@/components/ui';
import { gradients, palette, useTheme } from '@/theme';
import { closeAuthFlow } from './AuthHeader';

type Props = {
  title: string;
  subtitle: string;
  /** 'close' quitte le parcours ; 'back' revient à l'étape précédente. */
  action?: 'back' | 'close';
  onAction?: () => void;
  /** Illustration d'accueil (première étape seulement : écrans suivants plus compacts). */
  showArt?: boolean;
};

/** En-tête des écrans de connexion : dégradé de marque, motif, illustration, titre. */
export function AuthHero({ title, subtitle, action = 'back', onAction, showArt = false }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const handle = onAction ?? (action === 'close' ? closeAuthFlow : () => router.back());

  return (
    <View style={[styles.hero, { paddingTop: insets.top + 8, paddingBottom: 52 }]}>
      <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Pattern color={palette.white} opacity={0.07} size={40} />
      <View style={{ paddingHorizontal: theme.spacing.sm, zIndex: 2 }}>
        <Pressable
          onPress={handle}
          accessibilityRole="button"
          accessibilityLabel={action === 'close' ? 'Fermer' : 'Retour'}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons name={action === 'close' ? 'close' : 'arrow-back'} size={24} color={palette.white} />
        </Pressable>
      </View>
      {showArt ? (
        <View style={{ alignItems: 'center', marginTop: -8, zIndex: 1 }}>
          <SceneIllustration kind="welcome" size={170} />
        </View>
      ) : null}
      <FadeIn style={{ paddingHorizontal: theme.spacing.xl, gap: 6, marginTop: showArt ? 4 : theme.spacing.lg, zIndex: 2 }}>
        <Text variant="hero" style={{ color: palette.white, fontSize: 30, lineHeight: 36 }} accessibilityRole="header">
          {title}
        </Text>
        <Text style={{ color: palette.brand200 }}>{subtitle}</Text>
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});
