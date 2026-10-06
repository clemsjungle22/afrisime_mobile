import type { FacetKey, FacetValue, Facets } from '@afrisime/shared';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { BottomSheet, Button, Chip, Text } from '@/components/ui';
import { fontFamilies, minTouchSize, useTheme } from '@/theme';
import { FILTER_KEYS, PRICE_PRESETS, type CatalogFilters } from '../filters';
import { useFilterPreview } from '../hooks';

type Props = {
  visible: boolean;
  filters: CatalogFilters;
  /** Facettes actuellement affichées (avant tout changement). */
  facets: Facets | undefined;
  onApply: (filters: CatalogFilters) => void;
  onClose: () => void;
  /** Filtres gérés ailleurs : ni affichés, ni effacés par « Effacer ». */
  hide?: ReadonlyArray<FacetKey>;
};

const sections: ReadonlyArray<{ key: FacetKey; title: string }> = [
  { key: 'category', title: 'Rayon' },
  { key: 'offer', title: 'Offres' },
  { key: 'availability', title: 'Disponibilité' },
  { key: 'brand', title: 'Marque' },
  { key: 'packaging', title: 'Conditionnement' },
  { key: 'origin', title: 'Origine' },
];

function parseAmount(text: string): number | undefined {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : undefined;
}

/** Panneau de filtres : brouillon local, aperçu serveur du nombre de résultats, puis « Voir N produits ». */
export function FilterSheet({ visible, filters, facets, onApply, onClose, hide = [] }: Props) {
  const theme = useTheme();
  const [draft, setDraft] = useState<CatalogFilters>(filters);
  const wasVisible = useRef(visible);

  // Chaque OUVERTURE repart des filtres appliqués (pas chaque rendu du parent,
  // sinon un rafraîchissement en arrière-plan effacerait la saisie en cours).
  useEffect(() => {
    if (visible && !wasVisible.current) setDraft(filters);
    wasVisible.current = visible;
  }, [visible, filters]);

  const preview = useFilterPreview(draft, visible);
  const shownFacets = preview.data?.facets ?? facets;
  const total = preview.data?.total;

  const set = <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K] | undefined) =>
    setDraft((d) => {
      const next = { ...d };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });

  const toggle = (key: FacetKey, value: string) =>
    set(key, (draft[key] === value ? undefined : value) as CatalogFilters[typeof key]);

  const clear = () =>
    setDraft((d) => {
      const next = { ...d };
      for (const k of FILTER_KEYS) {
        if (!hide.includes(k as FacetKey)) delete next[k];
      }
      return next;
    });

  const applyLabel =
    total === undefined ? 'Appliquer' : total === 0 ? 'Aucun produit' : `Voir ${total} produit${total > 1 ? 's' : ''}`;

  return (
    <BottomSheet
      visible={visible}
      title="Filtres"
      onClose={onClose}
      footer={
        <View style={[styles.footer, { gap: theme.spacing.md }]}>
          <Button label="Effacer" variant="ghost" onPress={clear} />
          <Button
            label={applyLabel}
            style={styles.flex}
            loading={preview.isFetching && total === undefined}
            disabled={total === 0}
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
        </View>
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.xl }}
      >
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="label">Prix</Text>
          <View style={[styles.wrap, { gap: theme.spacing.sm }]}>
            {PRICE_PRESETS.map((p) => {
              const selected = draft.minPrice === p.min && draft.maxPrice === p.max;
              return (
                <Chip
                  key={p.label}
                  role="checkbox"
                  label={p.label}
                  selected={selected}
                  onPress={() =>
                    setDraft((d) => {
                      const next = { ...d };
                      delete next.minPrice;
                      delete next.maxPrice;
                      if (!selected) {
                        if (p.min !== undefined) next.minPrice = p.min;
                        if (p.max !== undefined) next.maxPrice = p.max;
                      }
                      return next;
                    })
                  }
                />
              );
            })}
          </View>
          <View style={[styles.row, { gap: theme.spacing.md }]}>
            <AmountInput
              label="Min (FCFA)"
              value={draft.minPrice}
              placeholder={preview.data?.priceBounds ? String(preview.data.priceBounds.min) : '0'}
              onChange={(v) => set('minPrice', v)}
            />
            <AmountInput
              label="Max (FCFA)"
              value={draft.maxPrice}
              placeholder={preview.data?.priceBounds ? String(preview.data.priceBounds.max) : ''}
              onChange={(v) => set('maxPrice', v)}
            />
          </View>
        </View>

        {sections
          .filter((s) => !hide.includes(s.key))
          .map((s) => (
            <FacetSection
              key={s.key}
              title={s.title}
              values={withSelected(shownFacets?.[s.key] ?? [], draft[s.key])}
              selected={draft[s.key]}
              onToggle={(v) => toggle(s.key, v)}
            />
          ))}
      </ScrollView>
    </BottomSheet>
  );
}

/** La valeur sélectionnée reste visible même si le serveur ne la renvoie plus (compte 0). */
function withSelected(values: FacetValue[], selected: string | undefined): FacetValue[] {
  if (!selected || values.some((v) => v.value === selected)) return values;
  return [{ value: selected, label: selected, count: 0 }, ...values];
}

function FacetSection({
  title,
  values,
  selected,
  onToggle,
}: {
  title: string;
  values: FacetValue[];
  selected: string | undefined;
  onToggle: (value: string) => void;
}) {
  const theme = useTheme();
  if (values.length === 0) return null;
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="label">{title}</Text>
      <View style={[styles.wrap, { gap: theme.spacing.sm }]}>
        {values.map((v) => {
          const isSelected = v.value === selected;
          return (
            <Chip
              key={v.value}
              role="checkbox"
              label={`${v.label} (${v.count})`}
              selected={isSelected}
              disabled={v.count === 0 && !isSelected}
              onPress={() => onToggle(v.value)}
            />
          );
        })}
      </View>
    </View>
  );
}

function AmountInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: number | undefined;
  placeholder: string;
  onChange: (value: number | undefined) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.flex, { gap: theme.spacing.xs }]}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        value={value === undefined ? '' : String(value)}
        onChangeText={(t) => onChange(parseAmount(t))}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.onDisabled}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={9}
        style={{
          minHeight: minTouchSize,
          paddingHorizontal: theme.spacing.md,
          borderWidth: 1,
          borderRadius: theme.radius.md,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          color: theme.colors.text,
          fontFamily: fontFamilies.medium,
          fontSize: 15,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  footer: { flexDirection: 'row', alignItems: 'center' },
});
