import { formatFCFA, type Quote } from '@afrisime/shared';
import { ActivityIndicator, View } from 'react-native';
import { Skeleton, Text } from '@/components/ui';
import { formatSlotDay, formatSlotHours } from '@/lib/dates';
import { useTheme } from '@/theme';

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
      <Text variant={strong ? 'subtitle' : 'body'} color={strong ? 'text' : 'textMuted'}>
        {label}
      </Text>
      <Text variant={strong ? 'price' : 'bodyStrong'}>{value}</Text>
    </View>
  );
}

type Props = {
  quote: Quote | undefined;
  /** Recalcul en cours (le devis affiché est l'ancien). */
  refreshing: boolean;
};

/** Récapitulatif chiffré par le serveur : c'est ce total qui sera payé. */
export function QuoteSummary({ quote, refreshing }: Props) {
  const theme = useTheme();
  if (!quote) {
    return (
      <View style={{ gap: theme.spacing.sm }} accessibilityLabel="Calcul du total">
        <Skeleton height={16} width="80%" />
        <Skeleton height={16} width="60%" />
        <Skeleton height={22} width="70%" />
      </View>
    );
  }
  const items = quote.lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <View style={{ gap: theme.spacing.sm, opacity: refreshing ? 0.6 : 1 }}>
      <Text variant="caption" color="textMuted">
        {quote.fulfillmentSummary} · {formatSlotDay(quote.slot.start)} {formatSlotHours(quote.slot.start, quote.slot.end)}
      </Text>
      <Row label={`Articles (${items})`} value={formatFCFA(quote.subtotal)} />
      {quote.fulfillment === 'delivery' ? (
        <Row label="Livraison" value={quote.deliveryFee === 0 ? 'Offerte' : formatFCFA(quote.deliveryFee)} />
      ) : (
        <Row label="Retrait en agence" value="Gratuit" />
      )}
      {quote.discountTotal > 0 ? <Row label="Remises" value={`-${formatFCFA(quote.discountTotal)}`} /> : null}
      {quote.deliveryBonus > 0 ? <Row label="Bonus Mobile Money (livraison)" value={`-${formatFCFA(quote.deliveryBonus)}`} /> : null}
      {quote.storeCreditApplied > 0 ? <Row label="Avoir" value={`-${formatFCFA(quote.storeCreditApplied)}`} /> : null}
      <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.xs }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Row label="Total" value={formatFCFA(quote.total)} strong />
        </View>
        {refreshing ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      </View>
    </View>
  );
}
