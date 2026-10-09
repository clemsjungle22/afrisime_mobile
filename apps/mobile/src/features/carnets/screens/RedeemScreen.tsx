import { formatFCFA, type Fulfillment } from '@afrisime/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isApiError } from '@/api/errors';
import { Button, ErrorState, RadioGroup, Segmented, Skeleton, Text } from '@/components/ui';
import { CheckoutSection } from '@/features/checkout/components/CheckoutSection';
import { SlotPicker } from '@/features/checkout/components/SlotPicker';
import { useAddresses, useDeliveryOptions } from '@/features/checkout/hooks';
import { haptics } from '@/lib/haptics';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { useCarnet, useRedeem } from '../hooks';

/** Recevoir le pack soldé : retrait en agence (gratuit) ou livraison (frais de zone au livreur). */
export function RedeemScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const carnet = useCarnet(id);
  const redeem = useRedeem(id);
  const addresses = useAddresses();
  const [fulfillment, setFulfillment] = useState<Fulfillment>('pickup');
  const [addressChoice, setAddressChoice] = useState<string | null>(null);
  const [agencyChoice, setAgencyChoice] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);

  const addressList = addresses.data ?? [];
  const addressId = addressChoice ?? addressList.find((a) => a.isDefault)?.id ?? addressList[0]?.id ?? null;
  const options = useDeliveryOptions(fulfillment === 'delivery' ? addressId : null, addresses.isSuccess);
  const agencies = options.data?.pickup.agencies ?? [];
  const agencyId = agencyChoice ?? agencies[0]?.agencyId ?? null;
  const delivery = options.data?.delivery;
  const slots =
    fulfillment === 'delivery'
      ? delivery?.available
        ? delivery.slots
        : []
      : (agencies.find((a) => a.agencyId === agencyId)?.slots ?? []);
  const slot = slots.find((x) => x.id === slotId && x.available) ?? null;

  if (carnet.isPending) return <Skeleton height={200} />;
  if (carnet.isError) return <ErrorState error={carnet.error} onRetry={() => void carnet.refetch()} />;
  const c = carnet.data;
  const fee =
    fulfillment === 'delivery' && delivery?.available
      ? delivery.freeAbove !== null && c.price >= delivery.freeAbove
        ? 0
        : delivery.fee
      : 0;
  const ready = slot !== null && (fulfillment === 'pickup' ? agencyId !== null : addressId !== null && !!delivery?.available);

  const submit = () => {
    if (!ready || !slot) return;
    redeem.mutate(
      {
        fulfillment,
        addressId: fulfillment === 'delivery' ? addressId : null,
        agencyId: fulfillment === 'pickup' ? agencyId : null,
        slotId: slot.id,
      },
      {
        onSuccess: (order) => {
          haptics.success();
          router.replace({ pathname: '/orders/[orderId]', params: { orderId: order.id } });
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'SLOT_UNAVAILABLE') {
            setSlotId(null);
            void options.refetch();
          }
          showSnackbar({ message: isApiError(e) && !e.isNetwork ? e.message : 'Connexion instable. Réessayez : votre pack ne sera commandé qu’une fois.' });
        },
      },
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Recevoir mon pack' }} />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg, paddingBottom: 160 }}>
        <View style={{ gap: 4 }}>
          <Text variant="title">{c.name}</Text>
          <Text color="textMuted">
            Soldé : {formatFCFA(c.price)} versés. Choisissez comment recevoir vos {c.items.length} produits.
          </Text>
        </View>
        <Segmented
          accessibilityLabel="Mode de réception"
          options={[
            { value: 'pickup', label: 'Retrait en agence' },
            { value: 'delivery', label: 'Livraison' },
          ]}
          value={fulfillment}
          onChange={(v) => {
            setFulfillment(v);
            setSlotId(null);
          }}
        />

        {fulfillment === 'pickup' ? (
          <CheckoutSection step={1} title="Agence">
            {options.data ? (
              <RadioGroup
                items={agencies.map((a) => ({ id: a.agencyId, title: a.name, subtitle: [a.address, a.openingHours].filter(Boolean).join(' · ') }))}
                value={agencyId}
                onChange={(v) => {
                  setAgencyChoice(v);
                  setSlotId(null);
                }}
              />
            ) : (
              <Skeleton height={64} />
            )}
          </CheckoutSection>
        ) : (
          <CheckoutSection step={1} title="Adresse de livraison">
            {addresses.isPending ? (
              <Skeleton height={64} />
            ) : addressList.length === 0 ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text color="textMuted">Ajoutez l’adresse où vous souhaitez être livré.</Text>
                <Button label="Ajouter une adresse" variant="secondary" onPress={() => router.push('/checkout/address')} />
              </View>
            ) : (
              <RadioGroup
                items={addressList.map((a) => ({ id: a.id, title: `${a.label} · ${a.recipientName}`, subtitle: [a.district, a.city].filter(Boolean).join(', ') }))}
                value={addressId}
                onChange={(v) => {
                  setAddressChoice(v);
                  setSlotId(null);
                }}
              />
            )}
            {delivery && !delivery.available ? (
              <Text color="warning">{delivery.unavailableReason ?? 'Livraison impossible à cette adresse.'}</Text>
            ) : null}
          </CheckoutSection>
        )}

        <CheckoutSection step={2} title="Créneau">
          {options.data ? (
            slots.length > 0 ? (
              <SlotPicker slots={slots} value={slot?.id ?? null} onChange={setSlotId} />
            ) : (
              <Text color="textMuted">Aucun créneau disponible pour ce choix.</Text>
            )
          ) : options.isError ? (
            <ErrorState error={options.error} onRetry={() => void options.refetch()} />
          ) : (
            <Skeleton height={80} />
          )}
        </CheckoutSection>
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, gap: theme.spacing.xs, padding: theme.spacing.lg, paddingBottom: Math.max(insets.bottom, theme.spacing.lg), backgroundColor: theme.colors.surface, boxShadow: theme.shadows.lg }}>
        <Text variant="caption" color="textMuted" align="center">
          {fulfillment === 'delivery'
            ? fee > 0
              ? `Pack réglé par votre carnet · ${formatFCFA(fee)} de livraison à payer au livreur`
              : 'Pack réglé par votre carnet · livraison offerte'
            : 'Pack réglé par votre carnet · rien à payer'}
        </Text>
        <Button label="Commander mon pack" size="lg" fullWidth disabled={!ready} loading={redeem.isPending} onPress={submit} />
      </View>
    </View>
  );
}
