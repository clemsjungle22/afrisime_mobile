import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA, type ValidatedCartLine } from '@afrisime/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isApiError } from '@/api/errors';
import { BottomSheet, Button, EmptyState, ErrorState, Skeleton, Text, TextField } from '@/components/ui';
import { ProductThumb } from '@/features/catalog/components/ProductThumb';
import { QuantityStepper } from '@/features/catalog/components/QuantityStepper';
import { haptics } from '@/lib/haptics';
import { openProduct } from '@/lib/links';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import {
  useDeleteList,
  useList,
  useListToCart,
  useRemoveListItem,
  useRenameList,
  useSetListItem,
} from '../hooks';

const failMessage = (error: unknown, fallback: string) =>
  isApiError(error) && !error.isNetwork ? error.message : fallback;

export function ListDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);
  useRefetchOnFocus(list.refetch);
  const toCart = useListToCart(id);
  const remove = useDeleteList();
  const [renaming, setRenaming] = useState(false);

  const askDelete = (name: string) =>
    Alert.alert('Supprimer la liste ?', `« ${name} » sera supprimée. Les produits restent au catalogue.`, [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () =>
          remove.mutate(id, {
            onSuccess: () => {
              showSnackbar({ message: 'Liste supprimée.' });
              router.back();
            },
            onError: (e) => showSnackbar({ message: failMessage(e, 'Suppression impossible pour le moment.') }),
          }),
      },
    ]);

  const header = (name: string) => (
    <Stack.Screen
      options={{
        title: name,
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Renommer la liste" hitSlop={10} onPress={() => setRenaming(true)}>
              <Ionicons name="create-outline" size={22} color={theme.colors.primary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Supprimer la liste" hitSlop={10} onPress={() => askDelete(name)}>
              <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
            </Pressable>
          </View>
        ),
      }}
    />
  );

  if (list.isPending) {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        <Stack.Screen options={{ title: 'Liste' }} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={88} radius={theme.radius.lg} />
        ))}
      </View>
    );
  }
  if (list.isError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Liste' }} />
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      </>
    );
  }

  const { lines, missingCount, name } = list.data;
  const available = lines.filter((l) => l.quantity > 0 && l.unitPrice !== null);
  const estimate = available.reduce((sum, l) => sum + (l.unitPrice ?? 0) * l.quantity, 0);

  const onToCart = () =>
    toCart.mutate(undefined, {
      onSuccess: ({ added, unavailable, reduced }) => {
        if (added > 0) haptics.success();
        const notes = [
          unavailable > 0 ? `${unavailable} indisponible${unavailable > 1 ? 's' : ''}` : null,
          reduced > 0 ? `${reduced} en quantité réduite` : null,
        ].filter(Boolean);
        showSnackbar({
          message:
            added === 0
              ? 'Aucun produit de cette liste n’est disponible pour le moment.'
              : `${added} produit${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} au panier${notes.length ? ` · ${notes.join(' · ')}` : ''}`,
          actionLabel: added > 0 ? 'Voir le panier' : undefined,
          onAction: added > 0 ? () => router.navigate('/panier') : undefined,
        });
      },
      onError: (e) => showSnackbar({ message: failMessage(e, 'Impossible pour le moment. Réessayez.') }),
    });

  return (
    <View style={{ flex: 1 }}>
      {header(name)}
      <FlatList
        data={lines}
        keyExtractor={(l) => l.variantId}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, flexGrow: 1 }}
        renderItem={({ item }) => <Line listId={id} line={item} />}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching}
            onRefresh={() => void list.refetch()}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          missingCount > 0 ? (
            <Text variant="caption" color="warning">
              {missingCount} produit{missingCount > 1 ? 's ne sont' : ' n’est'} plus au catalogue et {missingCount > 1 ? 'ont' : 'a'} été
              retiré{missingCount > 1 ? 's' : ''} de la liste.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="list-outline"
            title="Liste vide"
            description="Ouvrez un produit et touchez « Ajouter à une liste »."
            actionLabel="Voir la boutique"
            onAction={() => router.navigate('/boutique')}
          />
        }
      />
      {lines.length > 0 ? (
        <View
          style={{
            padding: theme.spacing.lg,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
            gap: theme.spacing.xs,
            backgroundColor: theme.colors.surface,
            boxShadow: theme.shadows.lg,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text color="textMuted">Estimation aux prix du jour</Text>
            <Text variant="bodyStrong">{formatFCFA(estimate)}</Text>
          </View>
          <Button
            label="Tout mettre au panier"
            size="lg"
            fullWidth
            loading={toCart.isPending}
            disabled={available.length === 0}
            onPress={onToCart}
          />
        </View>
      ) : null}
      <RenameSheet visible={renaming} listId={id} current={name} onClose={() => setRenaming(false)} />
    </View>
  );
}

/** Produit de la liste : quantité modifiable (enregistrée après une courte pause), retrait. */
function Line({ listId, line }: { listId: string; line: ValidatedCartLine }) {
  const theme = useTheme();
  const setItem = useSetListItem(listId);
  const removeItem = useRemoveListItem(listId);
  // Quantité en cours de saisie ; sinon, celle du serveur (autre appareil, rafraîchissement).
  const [draft, setDraft] = useState<number | null>(null);
  const quantity = draft ?? line.requestedQuantity;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const change = (next: number) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setItem.mutate(
        { variantId: line.variantId, quantity: next },
        {
          onSettled: () => setDraft(null),
          onError: (e) => showSnackbar({ message: failMessage(e, 'Quantité non enregistrée. Réessayez.') }),
        },
      );
    }, 600);
  };

  const unavailable = line.status === 'unavailable';
  const reduced = !unavailable && line.quantity < quantity;

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        padding: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        boxShadow: theme.shadows.sm,
        opacity: unavailable ? 0.7 : 1,
      }}
    >
      <View style={{ width: 56, height: 56, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
        <ProductThumb name={line.productName} imageUrl={line.imageUrl} color={line.color} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="bodyStrong" numberOfLines={2} onPress={() => openProduct(line.productSlug)} accessibilityRole="link">
          {line.productName}
        </Text>
        <Text variant="caption" color="textMuted">
          {line.brand} · {line.variantLabel}
          {line.unitPrice !== null ? ` · ${formatFCFA(line.unitPrice)}` : ' · Prix sur devis'}
        </Text>
        {unavailable ? (
          <Text variant="caption" color="error">
            Indisponible pour le moment
          </Text>
        ) : reduced ? (
          <Text variant="caption" color="warning">
            Plus que {line.quantity} disponible{line.quantity > 1 ? 's' : ''}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <QuantityStepper value={quantity} min={line.minQuantity} onChange={change} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retirer ${line.productName} de la liste`}
            hitSlop={10}
            onPress={() =>
              removeItem.mutate(line.variantId, {
                onError: (e) => showSnackbar({ message: failMessage(e, 'Retrait impossible. Réessayez.') }),
              })
            }
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.textMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function RenameSheet({
  visible,
  listId,
  current,
  onClose,
}: {
  visible: boolean;
  listId: string;
  current: string;
  onClose: () => void;
}) {
  const rename = useRenameList(listId);
  // Brouillon du nom ; null : le nom actuel (repris à chaque ouverture).
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? current;
  const setName = setDraft;
  const close = () => {
    setDraft(null);
    onClose();
  };
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === current) return close();
    rename.mutate(trimmed, {
      onSuccess: close,
      onError: (e) => showSnackbar({ message: failMessage(e, 'Nom non enregistré. Réessayez.') }),
    });
  };
  return (
    <BottomSheet
      visible={visible}
      title="Renommer la liste"
      onClose={close}
      footer={<Button label="Enregistrer" size="lg" fullWidth loading={rename.isPending} disabled={!name.trim()} onPress={submit} />}
    >
      <TextField label="Nom de la liste" value={name} onChangeText={setName} maxLength={60} autoFocus onSubmitEditing={submit} />
    </BottomSheet>
  );
}
