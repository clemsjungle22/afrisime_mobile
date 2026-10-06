import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { formatShortDateTime } from '@/lib/dates';
import { useIsOffline } from '@/lib/network';
import { useTheme } from '@/theme';
import { Text } from './Text';

type Props = {
  /** Date des données affichées (dataUpdatedAt de TanStack Query). 0 = inconnue. */
  updatedAt?: number;
};

/** Bandeau affiché uniquement hors connexion, avec l'âge des données en cache. */
export function OfflineBanner({ updatedAt = 0 }: Props) {
  const theme = useTheme();
  const offline = useIsOffline();
  if (!offline) return null;

  const label =
    updatedAt > 0
      ? `Hors connexion — données du ${formatShortDateTime(updatedAt)}`
      : 'Hors connexion — affichage limité';

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        backgroundColor: theme.colors.warningSoft,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={18} color={theme.colors.warning} />
      <Text variant="caption" color="warning" style={{ flex: 1 }}>
        {label}
      </Text>
    </View>
  );
}
