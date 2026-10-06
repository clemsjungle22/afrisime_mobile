import type { Variant } from '@afrisime/shared';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Text } from '@/components/ui';
import { minTouchSize, useTheme } from '@/theme';
import { presentAvailability } from '../availability';
import { variantPriceLabel } from '../pricing';

type Props = {
  variants: Variant[];
  selectedId: string;
  onSelect: (variant: Variant) => void;
};

/** Choix du conditionnement : chaque format a son prix et sa disponibilité. */
export function VariantSelector({ variants, selectedId, onSelect }: Props) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ gap: theme.spacing.sm }}>
      {variants.map((v) => {
        const selected = v.id === selectedId;
        const availability = presentAvailability(v.availability, v.leadTimeDays);
        return (
          <Pressable
            key={v.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${v.label}, ${variantPriceLabel(v)}, ${availability.label}`}
            onPress={() => onSelect(v)}
            style={[
              styles.row,
              {
                minHeight: minTouchSize + 8,
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: theme.spacing.sm,
                gap: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
              },
            ]}
          >
            <View style={[styles.radio, { borderColor: selected ? theme.colors.primary : theme.colors.border }]}>
              {selected ? <View style={[styles.radioDot, { backgroundColor: theme.colors.primary }]} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={[styles.labelRow, { gap: theme.spacing.sm }]}>
                <Text variant="bodyStrong">{v.label}</Text>
                {v.isPro ? <Badge label="Format pro" tone="neutral" /> : null}
              </View>
              {v.availability !== 'available' ? (
                <Text variant="caption" color={availability.tone === 'error' ? 'error' : 'textMuted'}>
                  {availability.label}
                  {availability.hint ? ` · ${availability.hint}` : ''}
                </Text>
              ) : null}
            </View>
            <View style={styles.price}>
              <Text variant="label" color={v.price === null ? 'warning' : 'text'}>
                {variantPriceLabel(v)}
              </Text>
              {v.compareAtPrice !== null && v.price !== null && v.compareAtPrice > v.price ? (
                <Text variant="caption" color="textMuted" style={styles.strike}>
                  {variantPriceLabel({ price: v.compareAtPrice })}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  price: {
    alignItems: 'flex-end',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
});
