import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA } from '@afrisime/shared';
import { router } from 'expo-router';
import { View } from 'react-native';
import { PressableScale, Text } from '@/components/ui';
import { useTheme } from '@/theme';
import { usePacks } from '../hooks';

/** Encart de l'accueil : les Packs Famille (rien s'il n'y a pas de pack proposé). */
export function PacksTeaser() {
  const theme = useTheme();
  const packs = usePacks();
  const items = packs.data?.items ?? [];
  if (items.length === 0) return null;
  const from = Math.min(...items.map((p) => p.dailyAmount));
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`Packs Famille, cotisez dès ${formatFCFA(from)} par jour`}
      onPress={() => router.push('/packs')}
      style={{
        marginHorizontal: theme.spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.primarySoft,
      }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.primary }}>
        <Ionicons name="wallet-outline" size={24} color={theme.colors.onPrimary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" color="onPrimarySoft">
          Packs Famille
        </Text>
        <Text variant="caption" color="onPrimarySoft">
          Cotisez dès {formatFCFA(from)} par jour, recevez vos courses à l’échéance.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.onPrimarySoft} />
    </PressableScale>
  );
}
