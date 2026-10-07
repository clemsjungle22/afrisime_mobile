import { formatFCFA, type Order } from '@afrisime/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';
import { z } from 'zod';
import { isApiError } from '@/api/errors';
import { Badge, Button, ErrorState, OfflineBanner, PaymentLogo, Skeleton, Text } from '@/components/ui';
import { ProductThumb } from '@/features/catalog/components/ProductThumb';
import { comingSoon } from '@/lib/comingSoon';
import { formatSlotDay, formatSlotHours } from '@/lib/dates';
import { openProduct } from '@/lib/links';
import { showSnackbar } from '@/stores/snackbar';
import { useTheme } from '@/theme';
import { OrderProgress } from '../components/OrderProgress';
import { StatusTimeline } from '../components/StatusTimeline';
import { useCancelOrder, useOrder, useReorder } from '../hooks';
import { orderStatusInfo, paymentMethodLabels } from '../status';

const Params = z.object({ orderId: z.string().min(1) });

export function OrderDetailScreen() {
  const parsed = Params.safeParse(useLocalSearchParams());
  if (!parsed.success) return <ErrorState error={null} onRetry={() => router.replace('/commandes')} />;
  return <OrderLoader orderId={parsed.data.orderId} />;
}

function OrderLoader({ orderId }: { orderId: string }) {
  const theme = useTheme();
  const order = useOrder(orderId);
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: order.data?.orderNumber ?? 'Commande' }} />
      <OfflineBanner updatedAt={order.dataUpdatedAt} />
      {order.data ? (
        <OrderContent order={order.data} />
      ) : order.isError ? (
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      ) : (
        <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
          <Skeleton height={60} />
          <Skeleton height={160} />
          <Skeleton height={120} />
        </View>
      )}
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Text variant="subtitle" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text color={strong ? 'text' : 'textMuted'} variant={strong ? 'bodyStrong' : 'body'}>
        {label}
      </Text>
      <Text variant={strong ? 'price' : 'bodyStrong'}>{value}</Text>
    </View>
  );
}

function OrderContent({ order }: { order: Order }) {
  const theme = useTheme();
  const cancel = useCancelOrder(order.id);
  const reorder = useReorder(order.id);
  const status = orderStatusInfo[order.status];
  const deadline = order.paymentDeadline ? Date.parse(order.paymentDeadline) - Date.now() : 0;

  const confirmCancel = () =>
    Alert.alert(
      'Annuler la commande ?',
      order.payment.status === 'succeeded'
        ? 'Le montant payé vous sera remboursé sur votre compte Mobile Money.'
        : 'Cette action est définitive.',
      [
        { text: 'Garder ma commande', style: 'cancel' },
        {
          text: 'Annuler la commande',
          style: 'destructive',
          onPress: () =>
            cancel.mutate(undefined, {
              onSuccess: () => showSnackbar({ message: 'Commande annulée.' }),
              onError: (e) =>
                showSnackbar({
                  message: isApiError(e) && !e.isNetwork ? e.message : 'Annulation impossible pour le moment. Réessayez.',
                }),
            }),
        },
      ],
    );

  const onReorder = () =>
    reorder.mutate(undefined, {
      onSuccess: ({ added, unavailable }) => {
        showSnackbar({
          message:
            added === 0
              ? 'Ces produits ne sont plus disponibles.'
              : unavailable > 0
                ? `${added} produit${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''} · ${unavailable} indisponible${unavailable > 1 ? 's' : ''}`
                : 'Produits ajoutés au panier.',
          actionLabel: added > 0 ? 'Voir le panier' : undefined,
          onAction: added > 0 ? () => router.navigate('/panier') : undefined,
        });
      },
      onError: () => showSnackbar({ message: 'Impossible pour le moment. Réessayez.' }),
    });

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Badge label={status.label} tone={status.tone} />
        <Text variant="priceLg" color="primary">{formatFCFA(order.total)}</Text>
      </View>

      <OrderProgress status={order.status} fulfillment={order.fulfillment} />

      {order.payable ? (
        <View style={{ gap: theme.spacing.sm, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.warningSoft }}>
          <Text variant="bodyStrong" color="warning">
            {order.status === 'payment_failed' ? 'Le paiement n’a pas abouti.' : 'Paiement à finaliser.'}
          </Text>
          {deadline > 0 ? (
            <Text variant="caption" color="warning">
              Sans paiement dans les {Math.ceil(deadline / 60_000)} min, la commande sera annulée automatiquement.
            </Text>
          ) : null}
          <Button
            label={`Payer ${formatFCFA(order.total)}`}
            onPress={() => router.push({ pathname: '/payment/[orderId]', params: { orderId: order.id } })}
          />
        </View>
      ) : null}

      {order.pickupCode && order.status !== 'cancelled' && order.status !== 'completed' ? (
        <View style={{ alignItems: 'center', gap: 4, padding: theme.spacing.lg, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primarySoft }}>
          <Text variant="label" color="onPrimarySoft">
            Code de retrait
          </Text>
          <Text variant="display" color="onPrimarySoft" selectable>
            {order.pickupCode}
          </Text>
        </View>
      ) : null}

      <Card title="Suivi">
        <StatusTimeline history={order.history} />
      </Card>

      <Card title="Réception">
        <Text>{order.fulfillmentSummary}</Text>
        <Text color="textMuted">
          {formatSlotDay(order.slot.start)} · {formatSlotHours(order.slot.start, order.slot.end)}
        </Text>
      </Card>

      <Card title={`Articles (${order.itemCount})`}>
        {order.lines
          .filter((l) => l.quantity > 0)
          .map((l) => (
            <View key={l.variantId} style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
              <View style={{ width: 44, height: 44, borderRadius: theme.radius.sm, overflow: 'hidden' }}>
                <ProductThumb name={l.productName} imageUrl={l.imageUrl} color={l.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  variant="bodyStrong"
                  numberOfLines={1}
                  onPress={() => openProduct(l.productSlug)}
                  accessibilityRole="link"
                >
                  {l.productName}
                </Text>
                <Text variant="caption" color="textMuted">
                  {l.quantity} × {l.variantLabel}
                </Text>
              </View>
              <Text variant="bodyStrong">{formatFCFA(l.lineTotal)}</Text>
            </View>
          ))}
        <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.xs }} />
        <Row label="Sous-total" value={formatFCFA(order.subtotal)} />
        {order.fulfillment === 'delivery' ? (
          <Row label="Livraison" value={order.deliveryFee === 0 ? 'Offerte' : formatFCFA(order.deliveryFee)} />
        ) : null}
        {order.discountTotal > 0 ? <Row label="Remises" value={`-${formatFCFA(order.discountTotal)}`} /> : null}
        <Row label="Total" value={formatFCFA(order.total)} strong />
      </Card>

      <Card title="Paiement">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <PaymentLogo method={order.payment.method} />
          <Text variant="bodyStrong">{paymentMethodLabels[order.payment.method]}</Text>
        </View>
        <Text variant="caption" color="textMuted">
          {order.payment.status === 'succeeded'
            ? 'Payé'
            : order.payment.status === 'refunded'
              ? 'Remboursement en cours'
              : order.payment.method === 'cash_on_delivery'
                ? 'À régler au livreur'
                : order.payment.method === 'pay_at_agency'
                  ? 'À régler en agence'
                  : 'Non payé'}
        </Text>
      </Card>

      <View style={{ gap: theme.spacing.sm }}>
        <Button label="Commander à nouveau" variant="secondary" loading={reorder.isPending} onPress={onReorder} />
        <Button label="Reçu / facture" variant="ghost" onPress={() => comingSoon('Le reçu PDF')} />
        {order.cancellable ? (
          <Button label="Annuler la commande" variant="ghost" loading={cancel.isPending} onPress={confirmCancel} />
        ) : null}
      </View>
    </ScrollView>
  );
}
