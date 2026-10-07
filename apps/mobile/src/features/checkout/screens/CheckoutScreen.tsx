import { formatFCFA, type Address } from '@afrisime/shared';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isApiError } from '@/api/errors';
import { BottomSheet, Button, ErrorState, OfflineBanner, PaymentLogo, RadioGroup, Segmented, Skeleton, Text } from '@/components/ui';
import { useMe } from '@/features/auth/hooks';
import { useSession } from '@/features/auth/session';
import { toValidateRequest, useCart } from '@/features/cart/store';
import { formatCountdown } from '@/lib/dates';
import { usePlaceOrder } from '@/features/orders/hooks';
import { useIsOffline } from '@/lib/network';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { CheckoutSection } from '../components/CheckoutSection';
import { QuoteSummary } from '../components/QuoteSummary';
import { SlotPicker } from '../components/SlotPicker';
import { toQuoteRequest, useAddresses, useDeliveryOptions, useQuote } from '../hooks';
import { methodsFor, resolveSelection } from '../selection';
import { useCheckout } from '../store';

/** Erreurs du devis qui renvoient au panier (il affichera le détail des changements). */
const BACK_TO_CART = new Set(['CART_CHANGED', 'OUT_OF_STOCK']);

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function addressLine(a: Address): string {
  return [a.district, a.city].filter(Boolean).join(', ');
}

export function CheckoutScreen() {
  const status = useSession((s) => s.status);
  // Vérifié à l'ouverture seulement : une fois la commande créée, le panier est vidé
  // pendant qu'on navigue vers le paiement — il ne faut pas rediriger vers le panier.
  const [hadLines] = useState(() => useCart.getState().lines.length > 0);
  if (status !== 'authenticated') return <Redirect href="/login" />;
  if (!hadLines) return <Redirect href="/panier" />;
  return <CheckoutContent />;
}

function CheckoutContent() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const offline = useIsOffline();
  const now = useNow();
  const prefs = useCheckout();
  const cartLines = useCart((s) => s.lines);
  const me = useMe();
  const addresses = useAddresses();
  const [pickerOpen, setPickerOpen] = useState(false);
  const placeOrder = usePlaceOrder();

  const addressList = addresses.data ?? [];
  // 1er passage : l'adresse ne dépend pas des options ; elle permet de les charger.
  const pre = resolveSelection({ prefs, addresses: addressList, options: undefined, profileAgencyId: null });
  const options = useDeliveryOptions(
    prefs.fulfillment === 'delivery' ? pre.selection.addressId : null,
    addresses.isSuccess,
  );
  const { selection, slots, missing } = resolveSelection({
    prefs,
    addresses: addressList,
    options: options.data,
    profileAgencyId: me.data?.agencyId ?? null,
  });

  const lines = useMemo(() => toValidateRequest(cartLines).lines, [cartLines]);
  const body = useMemo(() => toQuoteRequest(selection, lines), [selection, lines]);
  const quote = useQuote(missing ? null : body);
  const currentQuote = quote.data && !quote.isPlaceholderData ? quote.data : undefined;

  // Réactions aux erreurs métier du devis (une seule fois par erreur).
  const handled = useRef<unknown>(null);
  useEffect(() => {
    const e = quote.error;
    if (!e || handled.current === e) return;
    handled.current = e;
    if (isApiError(e) && BACK_TO_CART.has(e.code)) {
      showSnackbar({ message: 'Votre panier a changé : vérifiez-le avant de continuer.' });
      router.back();
    } else if (isApiError(e) && e.code === 'SLOT_UNAVAILABLE') {
      prefs.setSlot(null);
      void options.refetch();
      showSnackbar({ message: 'Ce créneau vient d’être complet. Choisissez-en un autre.' });
    }
  }, [quote.error, options, prefs]);

  const selectedAddress = addressList.find((a) => a.id === selection.addressId);
  const delivery = options.data?.delivery;
  const methods = methodsFor(options.data, selection.fulfillment);
  const quoteError = quote.error && isApiError(quote.error) && !BACK_TO_CART.has(quote.error.code) ? quote.error : null;
  const expiresIn = currentQuote ? Date.parse(currentQuote.expiresAt) - now : 0;
  const canConfirm = !!currentQuote && !quote.isFetching && !offline && expiresIn > 0 && !placeOrder.isPending;

  /** Crée la commande (même Idempotency-Key à chaque tentative pour ce devis), puis paiement ou confirmation. */
  const confirm = () => {
    if (!currentQuote) return;
    const pending = placeOrder.place(currentQuote.quoteId);
    if (!pending) return; // double tap : la 1re requête est déjà partie
    pending
      .then((order) => {
        const params = { orderId: order.id };
        if (order.payable) router.replace({ pathname: '/payment/[orderId]', params });
        else router.replace({ pathname: '/order-confirmation/[orderId]', params });
      })
      .catch((e: unknown) => {
        if (isApiError(e) && (e.code === 'QUOTE_EXPIRED' || e.code === 'SLOT_UNAVAILABLE')) {
          showSnackbar({ message: e.message });
          void options.refetch();
          void quote.refetch();
        } else if (isApiError(e) && BACK_TO_CART.has(e.code)) {
          showSnackbar({ message: 'Votre panier a changé : vérifiez-le avant de continuer.' });
          router.back();
        } else {
          showSnackbar({
            message: isApiError(e) && !e.isNetwork
              ? e.message
              : 'Commande non envoyée (connexion instable). Réessayez : elle ne sera pas créée deux fois.',
          });
        }
      });
  };

  if (addresses.isError && !addresses.data) {
    return <ErrorState error={addresses.error} onRetry={() => void addresses.refetch()} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <CheckoutSection step={1} title="Réception">
          <Segmented
            accessibilityLabel="Mode de réception"
            options={[
              { value: 'delivery', label: 'Livraison' },
              { value: 'pickup', label: 'Retrait en agence' },
            ]}
            value={prefs.fulfillment}
            onChange={prefs.setFulfillment}
          />
        </CheckoutSection>

        {prefs.fulfillment === 'delivery' ? (
          <CheckoutSection
            step={2}
            title="Adresse de livraison"
            action={
              addressList.length > 0 ? (
                <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button" hitSlop={12}>
                  <Text variant="label" color="primary">
                    Changer
                  </Text>
                </Pressable>
              ) : null
            }
          >
            {addresses.isPending ? (
              <Skeleton height={64} />
            ) : selectedAddress ? (
              <View style={{ gap: 2 }}>
                <Text variant="bodyStrong">
                  {selectedAddress.label} · {selectedAddress.recipientName}
                </Text>
                <Text color="textMuted">{addressLine(selectedAddress)}</Text>
                <Text variant="caption" color="textMuted">
                  Repère : {selectedAddress.landmark}
                </Text>
              </View>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <Text color="textMuted">Ajoutez l’adresse où vous souhaitez être livré.</Text>
                <Button label="Ajouter une adresse" variant="secondary" onPress={() => router.push('/checkout/address')} />
              </View>
            )}

            {delivery?.available && delivery.zone ? (
              <View style={{ gap: 2 }}>
                <Text variant="caption" color="success">
                  {delivery.zone.name} · livraison {formatFCFA(delivery.fee)}
                </Text>
                {delivery.freeAbove ? (
                  <Text variant="caption" color="textMuted">
                    Offerte dès {formatFCFA(delivery.freeAbove)} d’achats
                    {delivery.minOrderAmount ? ` · minimum ${formatFCFA(delivery.minOrderAmount)}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : delivery && !delivery.available ? (
              <View style={{ gap: theme.spacing.sm, padding: theme.spacing.md, borderRadius: theme.radius.md, backgroundColor: theme.colors.warningSoft }}>
                <Text variant="bodyStrong" color="warning">
                  {delivery.unavailableReason ?? 'Livraison impossible à cette adresse.'}
                </Text>
                <Button label="Passer au retrait en agence" variant="secondary" onPress={() => prefs.setFulfillment('pickup')} />
              </View>
            ) : null}
          </CheckoutSection>
        ) : (
          <CheckoutSection step={2} title="Agence de retrait">
            {options.data ? (
              <RadioGroup
                items={options.data.pickup.agencies.map((a) => ({
                  id: a.agencyId,
                  title: a.name,
                  subtitle: [a.address, a.openingHours].filter(Boolean).join(' · '),
                }))}
                value={selection.agencyId}
                onChange={prefs.setAgency}
              />
            ) : (
              <Skeleton height={64} />
            )}
          </CheckoutSection>
        )}

        <CheckoutSection step={3} title={prefs.fulfillment === 'delivery' ? 'Créneau de livraison' : 'Créneau de retrait'}>
          {options.data ? (
            missing === 'address' || missing === 'zone' ? (
              <Text color="textMuted">Choisissez d’abord une adresse desservie.</Text>
            ) : (
              <SlotPicker slots={slots} value={selection.slotId} onChange={prefs.setSlot} />
            )
          ) : options.isError ? (
            <ErrorState error={options.error} onRetry={() => void options.refetch()} />
          ) : (
            <Skeleton height={80} />
          )}
        </CheckoutSection>

        <CheckoutSection step={4} title="Paiement">
          {options.data ? (
            <RadioGroup
              items={methods.map((m) => ({
                id: m.id,
                title: m.label,
                subtitle: m.available ? m.description : m.unavailableReason,
                disabled: !m.available,
                leading: <PaymentLogo method={m.id} />,
              }))}
              value={selection.paymentMethod}
              onChange={(id) => prefs.setPaymentMethod(id as typeof methods[number]['id'])}
            />
          ) : (
            <Skeleton height={120} />
          )}
        </CheckoutSection>

        <CheckoutSection step={5} title="Récapitulatif">
          {missing ? (
            <Text color="textMuted">Complétez les étapes ci-dessus pour voir le total.</Text>
          ) : quoteError ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text color="error" accessibilityLiveRegion="assertive">
                {quoteError.isNetwork ? 'Connexion instable : impossible de calculer le total.' : quoteError.message}
              </Text>
              {quoteError.code === 'MIN_ORDER_NOT_MET' ? (
                <Button label="Compléter mon panier" variant="secondary" onPress={() => router.navigate('/boutique')} />
              ) : quoteError.code === 'ZONE_NOT_SERVED' ? (
                <Button label="Passer au retrait en agence" variant="secondary" onPress={() => prefs.setFulfillment('pickup')} />
              ) : (
                <Button label="Réessayer" variant="secondary" onPress={() => void quote.refetch()} />
              )}
            </View>
          ) : (
            <QuoteSummary quote={quote.data} refreshing={quote.isFetching && !!quote.data} />
          )}
        </CheckoutSection>
      </ScrollView>

      <View
        style={{
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: Math.max(insets.bottom, theme.spacing.md),
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        {currentQuote && expiresIn > 0 ? (
          <Text variant="caption" color="textMuted" align="center">
            Prix garantis encore {formatCountdown(expiresIn).slice(3)}
          </Text>
        ) : null}
        <Button
          label={currentQuote ? `Confirmer · ${formatFCFA(currentQuote.total)}` : 'Confirmer la commande'}
          size="lg"
          fullWidth
          disabled={!canConfirm}
          loading={placeOrder.isPending || (!!body && !missing && quote.isFetching && !quote.data)}
          onPress={confirm}
        />
      </View>

      <BottomSheet visible={pickerOpen} title="Adresse de livraison" onClose={() => setPickerOpen(false)}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <RadioGroup
            items={addressList.map((a) => ({
              id: a.id,
              title: `${a.label} · ${a.recipientName}`,
              subtitle: `${addressLine(a)}${a.zoneName ? ` · ${a.zoneName}` : ' · non desservie'}`,
              badge: a.isDefault ? 'Par défaut' : null,
            }))}
            value={selection.addressId}
            onChange={(id) => {
              prefs.setAddress(id);
              setPickerOpen(false);
            }}
          />
          <Button
            label="Nouvelle adresse"
            variant="secondary"
            onPress={() => {
              setPickerOpen(false);
              router.push('/checkout/address');
            }}
          />
        </ScrollView>
      </BottomSheet>
    </View>
  );
}
