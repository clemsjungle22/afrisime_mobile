import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA } from '@afrisime/shared';
import { router } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';
import { Button, ErrorState, Skeleton, Text } from '@/components/ui';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { useTheme } from '@/theme';
import { useStoreCredit } from '../hooks';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lome' });

/** Mon avoir : solde utilisable à la commande et mouvements. */
export function StoreCreditScreen() {
  const theme = useTheme();
  const credit = useStoreCredit();
  useRefetchOnFocus(credit.refetch);

  if (credit.isPending) return <Skeleton height={140} />;
  if (credit.isError) return <ErrorState error={credit.error} onRetry={() => void credit.refetch()} />;
  const { balance, entries } = credit.data;

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.id}
      contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={credit.isRefetching} onRefresh={() => void credit.refetch()} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.xs, padding: theme.spacing.xl, borderRadius: theme.radius.xl, backgroundColor: theme.colors.primary }}>
            <Text style={{ color: theme.colors.onPrimary }}>Solde disponible</Text>
            <Text variant="display" style={{ color: theme.colors.onPrimary }}>
              {formatFCFA(balance)}
            </Text>
            <Text variant="caption" style={{ color: theme.colors.onPrimary }}>
              Déduit de votre prochaine commande : cochez « Utiliser mon avoir » au moment de commander.
            </Text>
          </View>
          {balance > 0 ? <Button label="Faire mes courses" onPress={() => router.navigate('/boutique')} /> : null}
          <Text variant="subtitle">Mouvements</Text>
          {entries.length === 0 ? <Text color="textMuted">Aucun mouvement pour l’instant.</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Ionicons
            name={item.amount > 0 ? 'arrow-down-circle' : 'arrow-up-circle'}
            size={22}
            color={item.amount > 0 ? theme.colors.primary : theme.colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{item.label}</Text>
            <Text variant="caption" color="textMuted">
              {dateFmt.format(new Date(item.at))}
            </Text>
          </View>
          <Text variant="bodyStrong" color={item.amount > 0 ? 'primary' : 'text'}>
            {item.amount > 0 ? '+' : '−'}
            {formatFCFA(Math.abs(item.amount))}
          </Text>
        </View>
      )}
    />
  );
}
