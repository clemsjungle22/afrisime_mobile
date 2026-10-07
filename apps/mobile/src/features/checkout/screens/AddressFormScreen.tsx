import { zodResolver } from '@hookform/resolvers/zod';
import { formatNationalInput, toE164, type GeoPoint } from '@afrisime/shared';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { z } from 'zod';
import { isApiError } from '@/api/errors';
import { Button, Checkbox, Chip, Text, TextField } from '@/components/ui';
import { useMe } from '@/features/auth/hooks';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { useAddresses, useSaveAddress } from '../hooks';
import { useCheckout } from '../store';

const LABELS = ['Maison', 'Bureau', 'Boutique'] as const;

/** Formulaire : téléphone saisi au format national, converti en E.164 à l'envoi. */
export const AddressForm = z.object({
  label: z.string().trim().min(1, 'Donnez un nom à cette adresse').max(40),
  recipientName: z.string().trim().min(2, 'Indiquez le nom du destinataire').max(80),
  phone: z.string().refine((v) => toE164(v) !== null, 'Numéro mobile togolais invalide'),
  district: z.string().trim().min(2, 'Indiquez le quartier').max(80),
  city: z.string().trim().min(2, 'Indiquez la ville').max(60),
  landmark: z.string().trim().min(3, 'Indiquez un repère pour le livreur').max(160),
  instructions: z.string().trim().max(300),
  isDefault: z.boolean(),
});
export type AddressForm = z.infer<typeof AddressForm>;

type LocationState = { status: 'idle' | 'locating' | 'denied' | 'error' } | { status: 'done'; point: GeoPoint };

export function AddressFormScreen() {
  const theme = useTheme();
  const me = useMe();
  const addresses = useAddresses();
  const save = useSaveAddress();
  const setAddress = useCheckout((s) => s.setAddress);
  const [location, setLocation] = useState<LocationState>({ status: 'idle' });
  const isFirst = (addresses.data?.length ?? 0) === 0;

  const { control, handleSubmit, formState, setValue } = useForm<AddressForm>({
    resolver: zodResolver(AddressForm),
    defaultValues: {
      label: 'Maison',
      recipientName: [me.data?.firstName, me.data?.lastName].filter(Boolean).join(' '),
      phone: formatNationalInput(me.data?.phone ?? ''),
      district: '',
      city: 'Lomé',
      landmark: '',
      instructions: '',
      isDefault: isFirst,
    },
  });
  const errors = formState.errors;
  // useWatch (et non watch) : compatible avec le compilateur React.
  const label = useWatch({ control, name: 'label' });

  /** Position facultative : la permission n'est demandée qu'à ce moment, refus sans blocage. */
  const locate = async () => {
    setLocation({ status: 'locating' });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocation({ status: 'denied' });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocation({
        status: 'done',
        point: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        },
      });
    } catch {
      setLocation({ status: 'error' });
    }
  };

  const onSubmit = handleSubmit((values) => {
    save.mutate(
      {
        id: null,
        input: {
          label: values.label,
          recipientName: values.recipientName,
          phone: toE164(values.phone)!,
          district: values.district,
          city: values.city,
          landmark: values.landmark,
          instructions: values.instructions === '' ? null : values.instructions,
          location: location.status === 'done' ? location.point : null,
          isDefault: values.isDefault,
        },
      },
      {
        onSuccess: (address) => {
          setAddress(address.id);
          showSnackbar({
            message: address.zoneId
              ? `Adresse enregistrée · ${address.zoneName ?? ''}`
              : 'Adresse enregistrée, mais ce quartier n’est pas encore desservi.',
          });
          router.back();
        },
      },
    );
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label">Nom de l’adresse</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {LABELS.map((l) => (
              <Chip key={l} role="checkbox" label={l} selected={label === l} onPress={() => setValue('label', l)} />
            ))}
          </View>
          {!LABELS.includes(label as (typeof LABELS)[number]) || errors.label ? (
            <Controller
              control={control}
              name="label"
              render={({ field }) => (
                <TextField label="Autre nom" value={field.value} onChangeText={field.onChange} error={errors.label?.message} />
              )}
            />
          ) : null}
        </View>

        <Controller
          control={control}
          name="recipientName"
          render={({ field }) => (
            <TextField
              label="Destinataire"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.recipientName?.message}
              autoComplete="name"
              autoCapitalize="words"
            />
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <TextField
              label="Téléphone du destinataire (+228)"
              hint="Le livreur appellera ce numéro."
              value={field.value}
              onChangeText={(t) => field.onChange(formatNationalInput(t))}
              onBlur={field.onBlur}
              error={errors.phone?.message}
              keyboardType="phone-pad"
              maxLength={11}
            />
          )}
        />
        <Controller
          control={control}
          name="district"
          render={({ field }) => (
            <TextField
              label="Quartier"
              hint="Ex. Tokoin, Bè, Agoè, Adidogomé…"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.district?.message}
              autoCapitalize="words"
            />
          )}
        />
        <Controller
          control={control}
          name="city"
          render={({ field }) => (
            <TextField label="Ville" value={field.value} onChangeText={field.onChange} error={errors.city?.message} autoCapitalize="words" />
          )}
        />
        <Controller
          control={control}
          name="landmark"
          render={({ field }) => (
            <TextField
              label="Repère"
              hint="Ce qui aide le livreur à vous trouver : « en face de la pharmacie… », couleur du portail…"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.landmark?.message}
              multiline
              style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }}
            />
          )}
        />
        <Controller
          control={control}
          name="instructions"
          render={({ field }) => (
            <TextField
              label="Instructions (facultatif)"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.instructions?.message}
              multiline
              style={{ minHeight: 72, paddingTop: 12, textAlignVertical: 'top' }}
            />
          )}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label">Position (facultatif)</Text>
          {location.status === 'done' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Text color="success" style={{ flex: 1 }}>
                Position enregistrée
                {location.point.accuracy ? ` (± ${Math.round(location.point.accuracy)} m)` : ''}
              </Text>
              <Button label="Retirer" variant="ghost" onPress={() => setLocation({ status: 'idle' })} />
            </View>
          ) : (
            <Button
              label="Utiliser ma position actuelle"
              variant="secondary"
              loading={location.status === 'locating'}
              onPress={() => void locate()}
            />
          )}
          {location.status === 'denied' ? (
            <Text variant="caption" color="textMuted">
              Localisation refusée : ce n’est pas grave, le quartier et le repère suffisent.
            </Text>
          ) : location.status === 'error' ? (
            <Text variant="caption" color="textMuted">
              Position introuvable pour le moment. Vous pouvez continuer sans.
            </Text>
          ) : (
            <Text variant="caption" color="textMuted">
              Aide le livreur à vous trouver. Utilisée uniquement pour cette adresse.
            </Text>
          )}
        </View>

        {!isFirst ? (
          <Controller
            control={control}
            name="isDefault"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={field.onChange} accessibilityLabel="Adresse par défaut">
                <Text>Utiliser comme adresse par défaut</Text>
              </Checkbox>
            )}
          />
        ) : null}

        {save.isError ? (
          <Text color="error" accessibilityLiveRegion="assertive">
            {isApiError(save.error) && !save.error.isNetwork
              ? save.error.message
              : 'Enregistrement impossible. Vérifiez votre connexion puis réessayez.'}
          </Text>
        ) : null}

        <Button label="Enregistrer l’adresse" size="lg" fullWidth loading={save.isPending} onPress={() => void onSubmit()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
