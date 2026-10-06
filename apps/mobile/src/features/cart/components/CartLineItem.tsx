import Ionicons from '@expo/vector-icons/Ionicons';
import { formatFCFA, type ValidatedCartLine } from '@afrisime/shared';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Text } from '@/components/ui';
import { presentAvailability } from '@/features/catalog/availability';
import { ProductThumb } from '@/features/catalog/components/ProductThumb';
import { QuantityStepper } from '@/features/catalog/components/QuantityStepper';
import { openProduct } from '@/lib/links';
import { minTouchSize, useTheme } from '@/theme';
import type { LocalCartLine } from '../store';

type Props = {
  line: LocalCartLine;
  /** Ligne revalidée par le serveur (prix et stock qui font foi), si disponible. */
  server: ValidatedCartLine | undefined;
  onQuantityChange: (variantId: string, quantity: number) => void;
  onRemove: (variantId: string) => void;
};

export const CartLineItem = memo(function CartLineItem({ line, server, onQuantityChange, onRemove }: Props) {
  const theme = useTheme();
  const s = line.snapshot;
  const availability = server?.availability ?? s.availability;
  const unavailable = availability === 'unavailable' || server?.status === 'unavailable';
  const unitPrice = server?.unitPrice ?? s.unitPrice;
  const presentation = presentAvailability(availability, server?.leadTimeDays ?? s.leadTimeDays);
  const lineTotal = unitPrice !== null && !unavailable ? unitPrice * line.quantity : null;
  const max = server?.maxQuantity ?? undefined;

  return (
    <View
      style={[
        styles.row,
        {
          gap: theme.spacing.md,
          padding: theme.spacing.md,
          borderRadius: theme.radius.lg,
          borderColor: unavailable ? theme.colors.error : theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <Pressable
        onPress={() => openProduct(s.productSlug)}
        accessibilityRole="button"
        accessibilityLabel={`Voir ${s.name}`}
        style={[styles.thumb, { borderRadius: theme.radius.md, opacity: unavailable ? 0.5 : 1 }]}
      >
        <ProductThumb name={s.name} imageUrl={s.imageUrl} color={s.color} size="sm" />
      </Pressable>

      <View style={[styles.flex, { gap: 2 }]}>
        <View style={[styles.titleRow, { gap: theme.spacing.xs }]}>
          <Text variant="bodyStrong" numberOfLines={2} style={styles.flex}>
            {s.name}
          </Text>
          <Pressable
            onPress={() => onRemove(line.variantId)}
            accessibilityRole="button"
            accessibilityLabel={`Retirer ${s.name} du panier`}
            hitSlop={8}
            style={styles.remove}
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.textMuted} />
          </Pressable>
        </View>
        <Text variant="caption" color="textMuted">
          {s.variantLabel}
          {unitPrice !== null ? ` · ${formatFCFA(unitPrice)} l'unité` : ''}
        </Text>
        {availability === 'on_order' && presentation.hint ? (
          <Text variant="caption" color="info">
            Sur commande · {presentation.hint}
          </Text>
        ) : null}
        {unavailable ? (
          <Badge label="Plus disponible — non compté" tone="error" style={{ marginTop: 4 }} />
        ) : null}
        {max !== undefined && !unavailable && line.quantity >= max ? (
          <Text variant="caption" color="warning">
            Stock limité : {max} au maximum
          </Text>
        ) : null}

        <View style={[styles.bottomRow, { marginTop: theme.spacing.sm }]}>
          {unavailable ? (
            <View />
          ) : (
            <QuantityStepper
              value={line.quantity}
              min={s.minQuantity}
              max={max}
              onChange={(q) => onQuantityChange(line.variantId, q)}
            />
          )}
          <Text variant="price" color={unavailable ? 'textMuted' : 'text'}>
            {lineTotal !== null ? formatFCFA(lineTotal) : '—'}
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    borderWidth: 1,
  },
  thumb: {
    width: 72,
    height: 72,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  remove: {
    width: minTouchSize - 8,
    height: minTouchSize - 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginRight: -8,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
