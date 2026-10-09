import Ionicons from '@expo/vector-icons/Ionicons';
import { MAX_LISTS, type ShoppingListSummary } from '@afrisime/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { isApiError } from '@/api/errors';
import { BottomSheet, Button, EmptyState, ErrorState, PressableScale, Skeleton, Text, TextField } from '@/components/ui';
import { useRefetchOnFocus } from '@/lib/useRefetchOnFocus';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { useCreateList, useLists } from '../hooks';

const openList = (id: string) => router.push({ pathname: '/listes/[id]', params: { id } });

/** Listes d'achats récurrentes : à remplir depuis les fiches produits ou une commande passée. */
export function ListsScreen() {
  const theme = useTheme();
  const lists = useLists();
  useRefetchOnFocus(lists.refetch);
  const [creating, setCreating] = useState(false);

  if (lists.isPending) {
    return (
      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={76} radius={theme.radius.lg} />
        ))}
      </View>
    );
  }
  if (lists.isError) return <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />;
  const items = lists.data.items;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        keyExtractor={(l) => l.id}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, flexGrow: 1 }}
        renderItem={({ item }) => <ListRow list={item} />}
        refreshControl={
          <RefreshControl
            refreshing={lists.isRefetching}
            onRefresh={() => void lists.refetch()}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ListHeaderComponent={
          items.length > 0 ? (
            <Text color="textMuted">
              Vos courses habituelles, prêtes à recommander. Les prix sont toujours ceux du jour.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="list-outline"
            title="Aucune liste pour l’instant"
            description="Créez « Courses du mois » ou « Cuisine du restaurant », puis ajoutez-y des produits depuis leur fiche, ou enregistrez une commande passée comme liste."
            actionLabel="Créer une liste"
            onAction={() => setCreating(true)}
          />
        }
      />
      {items.length > 0 ? (
        <View style={{ padding: theme.spacing.lg, paddingTop: 0 }}>
          <Button
            label="Nouvelle liste"
            variant="secondary"
            fullWidth
            disabled={items.length >= MAX_LISTS}
            onPress={() => setCreating(true)}
            icon={<Ionicons name="add" size={20} color={theme.colors.onPrimarySoft} />}
          />
        </View>
      ) : null}
      <CreateListSheet visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

function ListRow({ list }: { list: ShoppingListSummary }) {
  const theme = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${list.name}, ${list.itemCount} produit${list.itemCount > 1 ? 's' : ''}`}
      onPress={() => openList(list.id)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        boxShadow: theme.shadows.sm,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.primarySoft,
        }}
      >
        <Ionicons name="list" size={22} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {list.name}
        </Text>
        <Text variant="caption" color="textMuted">
          {list.itemCount === 0 ? 'Vide' : `${list.itemCount} produit${list.itemCount > 1 ? 's' : ''}`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
    </PressableScale>
  );
}

/** Nouvelle liste vide (les produits s'ajoutent ensuite depuis leur fiche). */
export function CreateListSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const create = useCreateList();
  const [name, setName] = useState('');
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (list) => {
          setName('');
          onClose();
          openList(list.id);
        },
        onError: (error) =>
          showSnackbar({
            message: isApiError(error) && !error.isNetwork ? error.message : 'Liste non créée : vérifiez votre connexion.',
          }),
      },
    );
  };
  return (
    <BottomSheet
      visible={visible}
      title="Nouvelle liste"
      onClose={onClose}
      footer={<Button label="Créer la liste" size="lg" fullWidth loading={create.isPending} disabled={!name.trim()} onPress={submit} />}
    >
      <TextField
        label="Nom de la liste"
        value={name}
        onChangeText={setName}
        maxLength={60}
        placeholder="Courses du mois"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
    </BottomSheet>
  );
}
