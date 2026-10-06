import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA } from '@afrisime/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { z } from 'zod';
import { Button, ErrorState, Skeleton, Text } from '@/components/ui';
import { formatSlotDay, formatSlotHours } from '@/lib/dates';
import { useTheme } from '@/theme';
import { useOrder } from '../hooks';
import { paymentMethodLabels } from '../status';

const Params = z.object({ orderId: z.string().min(1) });

export function ConfirmationScreen() {
  const theme = useTheme();
  const parsed = Params.safeParse(useLocalSearchParams());
  const order = useOrder(parsed.success ? parsed.data.orderId : '');

  if (!parsed.success) return <ErrorState error={null} onRetry={() => router.replace('/commandes')} />;
  if (!order.data) {
    return order.isError ? (
      <ErrorState error={order.error} onRetry={() => void order.refetch()} />
    ) : (
      <View style={{ padding: theme.spacing.xl, gap: theme.spacing.md }}>
        <Skeleton height={120} />
        <Skeleton height={60} />
      </View>
    );
  }

  const o = order.data;
  const paidOnline = o.payment.status === 'succeeded';
  const slot = `${formatSlotDay(o.slot.start)} ${formatSlotHours(o.slot.start, o.slot.end)}`;

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}
    >
      <Stack.Screen options={{ title: 'Commande confirmée', headerBackVisible: false, gestureEnabled: false }} />
      <View style={{ alignItems: 'center', gap: theme.spacing.md }} accessibilityLiveRegion="polite">
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.successSoft,
          }}
        >
          <Ionicons name="checkmark" size={52} color={theme.colors.success} />
        </View>
        <Text variant="display" align="center" accessibilityRole="header">
          Merci !
        </Text>
        <Text align="center" color="textMuted">
          {paidOnline
            ? `Paiement ${paymentMethodLabels[o.payment.method]} reçu. Votre commande est confirmée.`
            : `Votre commande est confirmée. ${paymentMethodLabels[o.payment.method]} : ${formatFCFA(o.total)}.`}
        </Text>
      </View>

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
        <Text variant="caption" color="textMuted">
          Numéro de commande
        </Text>
        <Text variant="title" selectable>
          {o.orderNumber}
        </Text>
        <Text color="textMuted">
          {o.fulfillmentSummary} · {slot}
        </Text>
        <Text variant="price">{formatFCFA(o.total)}</Text>
      </View>

      {o.pickupCode ? (
        <View
          style={{
            alignItems: 'center',
            gap: theme.spacing.xs,
            padding: theme.spacing.lg,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.primarySoft,
          }}
        >
          <Text variant="label" color="onPrimarySoft">
            Code de retrait
          </Text>
          <Text variant="display" color="onPrimarySoft" selectable accessibilityLabel={`Code de retrait ${o.pickupCode.split('').join(' ')}`}>
            {o.pickupCode}
          </Text>
          <Text variant="caption" color="onPrimarySoft" align="center">
            À présenter en agence. Retrouvez-le à tout moment dans Commandes.
          </Text>
        </View>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label="Suivre ma commande"
          size="lg"
          fullWidth
          onPress={() => router.replace({ pathname: '/orders/[orderId]', params: { orderId: o.id } })}
        />
        <Button label="Continuer mes achats" variant="ghost" fullWidth onPress={() => router.dismissTo('/')} />
      </View>
    </ScrollView>
  );
}
