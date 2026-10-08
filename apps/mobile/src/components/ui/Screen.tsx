import type { ReactElement, ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Contenu défilant (formulaires, pages courtes). Pour une liste longue, utiliser FlashList sans scroll. */
  scroll?: boolean;
  padded?: boolean;
  /** Par défaut 'top' : la barre d'onglets gère déjà le bas. */
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  /** Tirer vers le bas pour actualiser (avec `scroll`). */
  refreshControl?: ReactElement<RefreshControlProps>;
};

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top'],
  contentStyle,
  refreshControl,
}: ScreenProps) {
  const theme = useTheme();
  const padding = padded ? { padding: theme.spacing.lg } : null;

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[padding, contentStyle]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, padding, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
