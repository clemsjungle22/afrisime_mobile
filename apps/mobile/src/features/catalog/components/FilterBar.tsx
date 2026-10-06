import Ionicons from '@expo/vector-icons/Ionicons';
import type { Facets } from '@afrisime/shared';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui';
import { minTouchSize, useTheme } from '@/theme';
import {
  activeFilters,
  countActiveFilters,
  defaultSort,
  sortLabels,
  type CatalogFilters,
} from '../filters';

type Props = {
  filters: CatalogFilters;
  facets: Facets | undefined;
  total: number | null;
  onChange: (filters: CatalogFilters) => void;
  onOpenFilters: () => void;
  onOpenSort: () => void;
  /** Filtres gérés ailleurs (ex. rayon dans la Boutique). */
  ignore?: ReadonlyArray<keyof CatalogFilters>;
};

/** Boutons Filtres / Tri, nombre de résultats et puces des filtres actifs. */
export function FilterBar({ filters, facets, total, onChange, onOpenFilters, onOpenSort, ignore = [] }: Props) {
  const theme = useTheme();
  const count = countActiveFilters(filters, ignore);
  const chips = activeFilters(filters, facets, ignore);
  const sort = filters.sort ?? defaultSort(filters);

  return (
    <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.sm }}>
      <View style={[styles.row, { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm }]}>
        <BarButton
          icon="options-outline"
          label={count > 0 ? `Filtres (${count})` : 'Filtres'}
          active={count > 0}
          onPress={onOpenFilters}
        />
        <BarButton icon="swap-vertical" label={sortLabels[sort]} active={!!filters.sort} onPress={onOpenSort} />
        <View style={styles.flex} />
        {total !== null ? (
          <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
            {total} {total > 1 ? 'produits' : 'produit'}
          </Text>
        ) : null}
      </View>
      {chips.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm }}
        >
          {chips.map((chip) => (
            <Pressable
              key={chip.id}
              accessibilityRole="button"
              accessibilityLabel={`Retirer le filtre ${chip.label}`}
              onPress={() => onChange(chip.remove(filters))}
              hitSlop={{ top: 6, bottom: 6 }}
              style={[
                styles.chip,
                {
                  gap: theme.spacing.xs,
                  paddingHorizontal: theme.spacing.md,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.primarySoft,
                },
              ]}
            >
              <Text variant="caption" color="onPrimarySoft" numberOfLines={1}>
                {chip.label}
              </Text>
              <Ionicons name="close" size={16} color={theme.colors.onPrimarySoft} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function BarButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: 'options-outline' | 'swap-vertical';
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.barButton,
        {
          gap: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.pill,
          borderColor: active ? theme.colors.primary : theme.colors.border,
          backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={active ? theme.colors.primary : theme.colors.text} />
      <Text variant="caption" color={active ? 'primary' : 'text'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderWidth: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    minWidth: minTouchSize,
  },
});
