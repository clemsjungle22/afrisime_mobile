import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA } from '@afrisime/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isApiError } from '@/api/errors';
import { Button, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { ProductThumb } from '@/features/catalog/components/ProductThumb';
import { haptics } from '@/lib/haptics';
import { openProduct } from '@/lib/links';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { usePacks, useSubscribe } from '../hooks';
import { savingOf } from './PacksScreen';

/** Fiche d'un pack : contenu, cotisation journalière, souscription. */
export function PackDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const packs = usePacks();
  const subscribe = useSubscribe();
  const authenticated = useSession((s) => s.status === 'authenticated');

  if (packs.isPending) {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <Skeleton height={180} radius={theme.radius.lg} />
        <Skeleton height={60} />
      </View>
    );
  }
  if (packs.isError) return <ErrorState error={packs.error} onRetry={() => void packs.refetch()} />;
  const pack = packs.data.items.find((p) => p.id === id);
  if (!pack) return <EmptyState icon="gift-outline" title="Ce pack n’est plus proposé" actionLabel="Voir les packs" onAction={() => router.replace('/packs')} />;
  const saving = savingOf(pack);

  const onSubscribe = () => {
    if (!authenticated) {
      showSnackbar({ message: 'Connectez-vous pour ouvrir votre carnet.', actionLabel: 'Se connecter', onAction: () => router.push('/login') });
      return;
    }
    subscribe.mutate(pack.id, {
      onSuccess: (carnet) => {
        haptics.success();
        router.replace({ pathname: '/carnets/[id]', params: { id: carnet.id } });
      },
      onError: (e) =>
        showSnackbar({ message: isApiError(e) && !e.isNetwork ? e.message : 'Souscription impossible : vérifiez votre connexion. Vous ne serez jamais inscrit deux fois.' }),
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: pack.name }} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 140 }}>
        <View style={{ height: 180, borderRadius: theme.radius.lg, overflow: 'hidden' }}>
          <ProductThumb name={pack.name} imageUrl={pack.imageUrl} color={theme.colors.primary} variant="vivid" />
        </View>
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="display">{pack.name}</Text>
          {pack.description ? <Text color="textMuted">{pack.description}</Text> : null}
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Fact label="Par jour" value={formatFCFA(pack.dailyAmount)} strong />
          <Fact label="Durée" value={`${pack.durationDays} jours`} />
          <Fact label="Total" value={formatFCFA(pack.price)} />
        </View>
        {saving > 0 ? (
          <Text color="success" variant="bodyStrong">
            {formatFCFA(saving)} d’économie par rapport aux prix du jour ({formatFCFA(pack.catalogValue!)}).
          </Text>
        ) : null}

        <View style={{ gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primarySoft }}>
          <Text variant="bodyStrong" color="onPrimarySoft">
            Comment ça marche ?
          </Text>
          {[
            'Vous cotisez chaque jour, par Mobile Money dans l’app ou en espèces dans votre agence.',
            'Vous pouvez verser plus pour finir plus vite.',
            'Une fois le pack soldé, vous recevez tous ses produits.',
            'Le contenu et le prix sont garantis dès aujourd’hui.',
          ].map((line) => (
            <View key={line} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} />
              <Text style={{ flex: 1 }} color="onPrimarySoft">
                {line}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="subtitle">Dans le pack</Text>
          {pack.items.map((item) => (
            <View key={item.variantId} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
              <View style={{ width: 44, height: 44, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
                <ProductThumb name={item.productName} imageUrl={item.imageUrl} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1} onPress={() => openProduct(item.productSlug)} accessibilityRole="link">
                  {item.productName}
                </Text>
                <Text variant="caption" color="textMuted">
                  {item.brand} · {item.variantLabel}
                </Text>
              </View>
              <Text variant="bodyStrong">× {item.quantity}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: theme.spacing.lg, paddingBottom: Math.max(insets.bottom, theme.spacing.lg), backgroundColor: theme.colors.surface, boxShadow: theme.shadows.lg }}>
        <Button label={`Ouvrir mon carnet · ${formatFCFA(pack.dailyAmount)} / jour`} size="lg" fullWidth loading={subscribe.isPending} onPress={onSubscribe} />
      </View>
    </View>
  );
}

function Fact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: 2, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.surface, boxShadow: theme.shadows.sm }}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <Text variant={strong ? 'price' : 'bodyStrong'} color={strong ? 'primary' : 'text'}>
        {value}
      </Text>
    </View>
  );
}
