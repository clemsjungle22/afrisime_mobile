import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSnackbar } from '@/stores/snackbar';
import { minTouchSize, palette, useTheme } from '@/theme';
import { Text } from './Text';

/**
 * Affiche le message courant en HAUT de l'écran : ne masque ni la barre d'onglets
 * ni les barres d'action du bas (fiche produit, panier).
 */
export function SnackbarHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const current = useSnackbar((s) => s.current);
  const hide = useSnackbar((s) => s.hide);

  useEffect(() => {
    if (!current) return;
    const id = setTimeout(() => hide(current.id), current.durationMs);
    return () => clearTimeout(id);
  }, [current, hide]);

  if (!current) return null;

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + theme.spacing.sm }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[
          styles.bar,
          {
            marginHorizontal: theme.spacing.lg,
            paddingLeft: theme.spacing.lg,
            borderRadius: theme.radius.md,
            backgroundColor: palette.brand950,
          },
        ]}
      >
        <Text variant="bodyStrong" style={[styles.flex, { color: palette.white }]} numberOfLines={2}>
          {current.message}
        </Text>
        {current.actionLabel && current.onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={current.actionLabel}
            onPress={() => {
              current.onAction?.();
              hide(current.id);
            }}
            style={[styles.action, { paddingHorizontal: theme.spacing.lg }]}
          >
            <Text variant="label" style={{ color: palette.accent500 }}>
              {current.actionLabel}
            </Text>
          </Pressable>
        ) : (
          <View style={{ width: theme.spacing.lg }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, paddingVertical: 12 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchSize + 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  action: {
    minHeight: minTouchSize,
    justifyContent: 'center',
  },
});
