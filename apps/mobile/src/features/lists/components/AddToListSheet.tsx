import type { CartLine } from '@afrisime/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { isApiError } from '@/api/errors';
import { BottomSheet, Button, RadioGroup, Text, TextField } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { useAddToList, useCreateList, useLists } from '../hooks';

const NEW = '__new__';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Format et quantité choisis sur la fiche produit. */
  item: CartLine;
  /** Texte du rappel (« Riz parfumé · Sac 5 kg × 2 »). */
  label: string;
};

/** Choix d'une liste d'achats (ou création) pour y ajouter le format choisi. */
export function AddToListSheet({ visible, onClose, item, label }: Props) {
  const theme = useTheme();
  const lists = useLists();
  const add = useAddToList();
  const create = useCreateList();
  const [choice, setChoice] = useState<string | null>(null);
  const [name, setName] = useState('');
  const items = lists.data?.items ?? [];
  const selected = choice ?? (items[0]?.id ?? NEW);
  const pending = add.isPending || create.isPending;

  const done = (listName: string, listId: string) => {
    haptics.success();
    onClose();
    setName('');
    setChoice(null);
    showSnackbar({
      message: `Ajouté à « ${listName} »`,
      actionLabel: 'Voir la liste',
      onAction: () => router.push({ pathname: '/listes/[id]', params: { id: listId } }),
    });
  };
  const fail = (error: unknown) =>
    showSnackbar({
      message: isApiError(error) && !error.isNetwork ? error.message : 'Non enregistré : vérifiez votre connexion.',
    });

  const confirm = () => {
    if (selected === NEW) {
      const trimmed = name.trim();
      if (!trimmed) return;
      create.mutate({ name: trimmed, lines: [item] }, { onSuccess: (l) => done(l.name, l.id), onError: fail });
    } else {
      add.mutate({ listId: selected, item }, { onSuccess: (l) => done(l.name, l.id), onError: fail });
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title="Ajouter à une liste"
      onClose={onClose}
      footer={
        <Button
          label={selected === NEW ? 'Créer la liste et ajouter' : 'Ajouter'}
          size="lg"
          fullWidth
          loading={pending}
          disabled={selected === NEW && !name.trim()}
          onPress={confirm}
        />
      }
    >
      <View style={{ gap: theme.spacing.md }}>
        <Text color="textMuted">{label}</Text>
        {lists.isPending ? (
          <ActivityIndicator color={theme.colors.primary} />
        ) : (
          <RadioGroup
            items={[
              ...items.map((l) => ({
                id: l.id,
                title: l.name,
                subtitle: `${l.itemCount} produit${l.itemCount > 1 ? 's' : ''}`,
              })),
              { id: NEW, title: 'Nouvelle liste', subtitle: 'Ex. Courses du mois, Cuisine du restaurant' },
            ]}
            value={selected}
            onChange={setChoice}
          />
        )}
        {selected === NEW ? (
          <TextField
            label="Nom de la nouvelle liste"
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder="Courses du mois"
            returnKeyType="done"
            onSubmitEditing={confirm}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}
