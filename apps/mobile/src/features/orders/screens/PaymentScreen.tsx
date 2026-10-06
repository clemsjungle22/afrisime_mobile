import Ionicons from '@expo/vector-icons/Ionicons';
import {
  formatFCFA,
  formatNationalInput,
  formatPhone,
  toE164,
  type Order,
  type PaymentIntent,
} from '@afrisime/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { z } from 'zod';
import { newIdempotencyKey } from '@/api/client';
import { isApiError } from '@/api/errors';
import { Button, ErrorState, Segmented, Skeleton, Text, TextField } from '@/components/ui';
import { useSession } from '@/features/auth/session';
import { formatCountdown } from '@/lib/dates';
import { useTheme } from '@/theme';
import { ordersApi } from '../api';
import { ordersKeys, useOrder } from '../hooks';
import { isMobileMoney, nextPollDelay, paymentMethodLabels } from '../status';

const Params = z.object({ orderId: z.string().min(1) });

export function PaymentScreen() {
  const parsed = Params.safeParse(useLocalSearchParams());
  if (!parsed.success) return <ErrorState error={null} onRetry={() => router.replace('/commandes')} />;
  return <PaymentLoader orderId={parsed.data.orderId} />;
}

function PaymentLoader({ orderId }: { orderId: string }) {
  const theme = useTheme();
  const order = useOrder(orderId);
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: order.data ? `Paiement · ${order.data.orderNumber}` : 'Paiement' }} />
      {order.data ? (
        <PaymentFlow order={order.data} />
      ) : order.isError ? (
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      ) : (
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <Skeleton height={80} />
          <Skeleton height={56} />
        </View>
      )}
    </View>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * Paiement Mobile Money : le statut affiché est TOUJOURS celui du serveur (jamais supposé).
 * Une Idempotency-Key par tentative, réutilisée si la requête doit être renvoyée (RB-003).
 */
function PaymentFlow({ order }: { order: Order }) {
  const theme = useTheme();
  const client = useQueryClient();
  const accountPhone = useSession((s) => s.phone);
  const [method, setMethod] = useState<'tmoney' | 'flooz'>(isMobileMoney(order.payment.method) ? order.payment.method : 'tmoney');
  const [phoneInput, setPhoneInput] = useState(formatNationalInput(accountPhone ?? ''));
  // Reprise : une tentative déjà en cours pour cette commande est suivie directement.
  const [paymentId, setPaymentId] = useState<string | null>(
    order.payment.status === 'pending' ? order.payment.paymentId : null,
  );
  const startedAt = useRef(Date.now());
  const attemptKey = useRef<string | null>(null);

  const phone = toE164(phoneInput);

  // Même clé uniquement pour renvoyer la MÊME demande ; un autre numéro ou opérateur = autre demande
  // (le serveur renvoie de toute façon une tentative encore en cours : jamais deux débits, RB-003).
  useEffect(() => {
    attemptKey.current = null;
  }, [phone, method]);

  const create = useMutation({
    mutationFn: () => {
      attemptKey.current ??= newIdempotencyKey();
      return ordersApi.createPayment({ orderId: order.id, method, phone }, attemptKey.current);
    },
    onSuccess: (intent) => {
      startedAt.current = Date.now();
      client.setQueryData(ordersKeys.payment(intent.id), intent);
      setPaymentId(intent.id);
    },
  });

  const status = useQuery({
    queryKey: ordersKeys.payment(paymentId ?? 'none'),
    queryFn: ({ signal }) => ordersApi.getPayment(paymentId!, signal),
    enabled: paymentId !== null,
    refetchInterval: (q) => nextPollDelay(q.state.data, startedAt.current, Date.now()),
    retry: 2,
  });
  const intent: PaymentIntent | undefined = paymentId ? status.data : undefined;
  const polling = intent !== undefined && (intent.status === 'pending' || intent.status === 'initiated');
  const now = useNow(polling);
  const stoppedWaiting = polling && nextPollDelay(intent, startedAt.current, now) === false;

  // Succès confirmé PAR LE SERVEUR → écran de confirmation.
  useEffect(() => {
    if (intent?.status !== 'succeeded') return;
    void client.invalidateQueries({ queryKey: ordersKeys.all });
    router.replace({ pathname: '/order-confirmation/[orderId]', params: { orderId: order.id } });
  }, [intent?.status, client, order.id]);

  /** Nouvelle tentative après échec / expiration : nouvelle clé (c'est un nouveau paiement). */
  const retry = () => {
    attemptKey.current = null;
    setPaymentId(null);
    create.reset();
  };

  if (!order.payable && intent?.status !== 'succeeded') {
    return (
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.lg }}>
        <Text variant="subtitle">Cette commande n’attend pas de paiement.</Text>
        <Button label="Voir la commande" onPress={() => router.replace({ pathname: '/orders/[orderId]', params: { orderId: order.id } })} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }} keyboardShouldPersistTaps="handled">
      <View style={{ gap: theme.spacing.xs }}>
        <Text color="textMuted">Montant à payer</Text>
        <Text variant="display">{formatFCFA(order.total)}</Text>
        <Text variant="caption" color="textMuted">
          Commande {order.orderNumber} · {order.fulfillmentSummary}
        </Text>
      </View>

      {intent && polling && !stoppedWaiting ? (
        <View
          accessibilityLiveRegion="polite"
          style={{ gap: theme.spacing.md, padding: theme.spacing.xl, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primarySoft, alignItems: 'center' }}
        >
          <Ionicons name="phone-portrait-outline" size={44} color={theme.colors.onPrimarySoft} />
          <Text variant="title" align="center">
            Confirmez sur votre téléphone
          </Text>
          <Text align="center" color="textMuted">
            {intent.action.instructions ?? 'Validez la demande de paiement reçue sur votre téléphone.'}
          </Text>
          <Text variant="caption" align="center" color="textMuted">
            Demande envoyée au {phone ? formatPhone(phone) : 'numéro indiqué'} · {paymentMethodLabels[intent.method]}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <ActivityIndicator color={theme.colors.primary} />
            <Text variant="bodyStrong">
              En attente de confirmation · {formatCountdown(Math.max(0, Date.parse(intent.expiresAt) - now)).slice(3)}
            </Text>
          </View>
        </View>
      ) : intent && stoppedWaiting ? (
        <View style={{ gap: theme.spacing.md, padding: theme.spacing.xl, borderRadius: theme.radius.lg, backgroundColor: theme.colors.warningSoft }}>
          <Text variant="subtitle" color="warning">
            Paiement en attente
          </Text>
          <Text>
            Nous n’avons pas encore reçu la confirmation de l’opérateur. Votre commande est enregistrée : si vous avez
            validé, elle sera confirmée automatiquement. Vous ne serez jamais débité deux fois.
          </Text>
          <Button label="Vérifier à nouveau" variant="secondary" loading={status.isFetching} onPress={() => void status.refetch()} />
          <Button
            label="Voir ma commande"
            variant="ghost"
            onPress={() => router.replace({ pathname: '/orders/[orderId]', params: { orderId: order.id } })}
          />
        </View>
      ) : intent && (intent.status === 'failed' || intent.status === 'expired') ? (
        <View style={{ gap: theme.spacing.md, padding: theme.spacing.xl, borderRadius: theme.radius.lg, backgroundColor: theme.colors.errorSoft }}>
          <Text variant="subtitle" color="error">
            {intent.status === 'expired' ? 'Délai de confirmation dépassé' : 'Paiement non abouti'}
          </Text>
          <Text>{intent.failureReason ?? 'Le paiement n’a pas pu être effectué.'} Aucun montant n’a été débité.</Text>
          <Button label="Réessayer" onPress={retry} />
        </View>
      ) : (
        <View style={{ gap: theme.spacing.lg }}>
          <Segmented
            accessibilityLabel="Opérateur Mobile Money"
            options={[
              { value: 'tmoney', label: 'T-Money' },
              { value: 'flooz', label: 'Flooz' },
            ]}
            value={method}
            onChange={setMethod}
          />
          <TextField
            label="Numéro Mobile Money (+228)"
            hint="Le numéro qui recevra la demande de paiement."
            value={phoneInput}
            onChangeText={(t) => setPhoneInput(formatNationalInput(t))}
            keyboardType="phone-pad"
            maxLength={11}
            error={phoneInput.replace(/\D/g, '').length === 8 && !phone ? 'Numéro mobile togolais invalide' : undefined}
          />
          {create.isError ? (
            <Text color="error" accessibilityLiveRegion="assertive">
              {isApiError(create.error) && !create.error.isNetwork
                ? create.error.message
                : 'Connexion instable. Réessayez : vous ne serez pas débité deux fois.'}
            </Text>
          ) : null}
          <Button
            label={`Payer ${formatFCFA(order.total)}`}
            size="lg"
            fullWidth
            disabled={!phone}
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
          {order.paymentDeadline ? (
            <Text variant="caption" color="textMuted" align="center">
              Sans paiement, la commande sera annulée automatiquement.
            </Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
