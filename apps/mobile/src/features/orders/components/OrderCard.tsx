import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA, type OrderSummary } from '@afrisime/shared';
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Badge, Text } from '@/components/ui';
import { formatShortDateTime, formatSlotDay, formatSlotHours } from '@/lib/dates';
import { useTheme } from '@/theme';
import { orderStatusInfo } from '../status';

type Props = {
  order: OrderSummary;
  onPress: (order: OrderSummary) => void;
};

export const OrderCard = memo(function OrderCard({ order, onPress }: Props) {
  const theme = useTheme();
  const status = orderStatusInfo[order.status];
  return (
    <Pressable
      onPress={() => onPress(order)}
      accessibilityRole="button"
      accessibilityLabel={`Commande ${order.orderNumber}, ${status.label}, ${formatFCFA(order.total)}`}
      style={({ pressed }) => ({
        gap: theme.spacing.sm,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: order.payable ? theme.colors.warning : theme.colors.border,
        backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <Text variant="bodyStrong">{order.orderNumber}</Text>
        <Badge label={status.label} tone={status.tone} />
      </View>
      <Text variant="caption" color="textMuted">
        Passée le {formatShortDateTime(Date.parse(order.createdAt))} · {order.itemCount} article{order.itemCount > 1 ? 's' : ''}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {order.fulfillmentSummary} · {formatSlotDay(order.slot.start)} {formatSlotHours(order.slot.start, order.slot.end)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="price">{formatFCFA(order.total)}</Text>
        {order.payable ? (
          <Text variant="label" color="warning">
            Paiement à finaliser
          </Text>
        ) : (
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        )}
      </View>
    </Pressable>
  );
});
