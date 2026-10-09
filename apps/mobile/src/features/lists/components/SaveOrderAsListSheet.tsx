import { router } from 'expo-router';
import { useState } from 'react';
import { isApiError } from '@/api/errors';
import { BottomSheet, Button, Text, TextField } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { useCreateList } from '../hooks';

/** Enregistre les produits d'une commande passée comme liste d'achats (pour la refaire plus tard). */
export function SaveOrderAsListSheet({
  visible,
  onClose,
  orderId,
  defaultName,
}: {
  visible: boolean;
  onClose: () => void;
  orderId: string;
  defaultName: string;
}) {
  const theme = useTheme();
  const create = useCreateList();
  // Brouillon du nom ; null : le nom proposé (repris à chaque ouverture).
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? defaultName;
  const close = () => {
    setDraft(null);
    onClose();
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, fromOrderId: orderId },
      {
        onSuccess: (list) => {
          haptics.success();
          close();
          showSnackbar({
            message: `Liste « ${list.name} » enregistrée`,
            actionLabel: 'Voir',
            onAction: () => router.push({ pathname: '/listes/[id]', params: { id: list.id } }),
          });
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
      title="Enregistrer comme liste"
      onClose={close}
      footer={<Button label="Enregistrer la liste" size="lg" fullWidth loading={create.isPending} disabled={!name.trim()} onPress={submit} />}
    >
      <Text color="textMuted" style={{ marginBottom: theme.spacing.md }}>
        Les produits et quantités de cette commande, à recommander en un geste aux prix du jour.
      </Text>
      <TextField label="Nom de la liste" value={name} onChangeText={setDraft} maxLength={60} onSubmitEditing={submit} />
    </BottomSheet>
  );
}
