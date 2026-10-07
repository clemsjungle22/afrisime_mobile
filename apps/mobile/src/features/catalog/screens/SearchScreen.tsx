import Ionicons from '@expo/vector-icons/Ionicons';
import type { Suggestion } from '@afrisime/shared';
import { router } from 'expo-router';
import { useRef, useState, type ComponentProps } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SceneIllustration } from '@/components/illustrations/SceneIllustration';
import { Chip, EmptyState, Screen, Text } from '@/components/ui';
import { openProduct } from '@/lib/links';
import { useRecentSearches } from '@/stores/recentSearches';
import { fontFamilies, minTouchSize, useTheme } from '@/theme';
import { FilteredProducts } from '../components/FilteredProducts';
import { countActiveFilters, type CatalogFilters } from '../filters';
import { useSuggestions } from '../hooks';
import { useFilterParams } from '../useFilterParams';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Recherches fréquentes proposées quand le champ est vide (à alimenter par l'API plus tard). */
const POPULAR = ['Riz', 'Huile', 'Gari', 'Eau', 'Savon', 'Sucre'];

const suggestionIcons: Record<Suggestion['type'], IconName> = {
  query: 'search',
  product: 'pricetag-outline',
  category: 'grid-outline',
  brand: 'ribbon-outline',
};

export function SearchScreen() {
  const theme = useTheme();
  const { filters, setFilters } = useFilterParams();
  const [text, setText] = useState(filters.q ?? '');
  const [editing, setEditing] = useState(!filters.q);
  const inputRef = useRef<TextInput>(null);
  const addRecent = useRecentSearches((s) => s.add);

  const submit = (raw: string) => {
    const q = raw.trim();
    if (q.length < 1) return;
    addRecent(q);
    setText(q);
    setEditing(false);
    Keyboard.dismiss();
    // Nouvelle recherche : on repart sans filtres.
    setFilters({ q });
  };

  const onSuggestion = (s: Suggestion) => {
    switch (s.type) {
      case 'product':
        addRecent(text);
        openProduct(s.value);
        return;
      case 'category':
        Keyboard.dismiss();
        router.navigate({ pathname: '/boutique', params: { category: s.value } });
        return;
      case 'brand':
      case 'query':
        submit(s.value);
    }
  };

  return (
    <Screen padded={false}>
      <View style={[styles.header, { paddingHorizontal: theme.spacing.sm, gap: theme.spacing.xs }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={styles.iconButton}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
        </Pressable>
        <View
          style={[
            styles.inputWrap,
            {
              borderRadius: theme.radius.pill,
              borderColor: editing ? theme.colors.primary : theme.colors.border,
              backgroundColor: theme.colors.surface,
              paddingLeft: theme.spacing.md,
            },
          ]}
        >
          <Ionicons name="search" size={20} color={theme.colors.textMuted} />
          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            onFocus={() => setEditing(true)}
            onSubmitEditing={() => submit(text)}
            autoFocus={!filters.q}
            placeholder="Riz, huile, gari, savon…"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={100}
            accessibilityLabel="Rechercher un produit"
            style={[styles.input, { color: theme.colors.text, fontFamily: fontFamilies.medium }]}
          />
          {text.length > 0 ? (
            <Pressable
              onPress={() => {
                setText('');
                setEditing(true);
                inputRef.current?.focus();
              }}
              accessibilityRole="button"
              accessibilityLabel="Effacer la saisie"
              style={styles.iconButton}
            >
              <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {editing || !filters.q ? (
        <SearchAssist text={text} onSubmit={submit} onSuggestion={onSuggestion} />
      ) : (
        <FilteredProducts
          filters={filters}
          onChange={setFilters}
          header={(products) =>
            products.correctedQuery && products.items.length > 0 ? (
              <View style={{ paddingHorizontal: theme.spacing.xs + 2, paddingBottom: theme.spacing.sm }}>
                <Text variant="caption" color="textMuted">
                  Résultats pour « <Text variant="caption" color="text">{products.correctedQuery}</Text> »
                  {'  '}(aucun résultat exact pour « {filters.q} »)
                </Text>
              </View>
            ) : null
          }
          empty={() => <NoResults filters={filters} onChange={setFilters} />}
        />
      )}
    </Screen>
  );
}

/** Pendant la saisie : suggestions ; champ vide : recherches récentes. */
function SearchAssist({
  text,
  onSubmit,
  onSuggestion,
}: {
  text: string;
  onSubmit: (q: string) => void;
  onSuggestion: (s: Suggestion) => void;
}) {
  const theme = useTheme();
  const suggestions = useSuggestions(text);
  const recent = useRecentSearches((s) => s.items);
  const removeRecent = useRecentSearches((s) => s.remove);
  const clearRecent = useRecentSearches((s) => s.clear);
  const typing = text.trim().length >= 2;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: theme.spacing.sm }}>
      {typing ? (
        <>
          {suggestions.data?.correctedQuery ? (
            <Row
              icon="sparkles-outline"
              label={`Vouliez-vous dire « ${suggestions.data.correctedQuery} » ?`}
              emphasis
              onPress={() => onSubmit(suggestions.data!.correctedQuery!)}
            />
          ) : null}
          <Row icon="search" label={`Rechercher « ${text.trim()} »`} onPress={() => onSubmit(text)} />
          {(suggestions.data?.suggestions ?? []).map((s) => (
            <Row
              key={`${s.type}:${s.value}`}
              icon={suggestionIcons[s.type]}
              label={s.label}
              caption={s.type === 'category' ? 'Rayon' : s.type === 'brand' ? 'Marque' : undefined}
              onPress={() => onSuggestion(s)}
            />
          ))}
        </>
      ) : recent.length > 0 ? (
        <>
          <View style={[styles.sectionHeader, { paddingHorizontal: theme.spacing.lg }]}>
            <Text variant="label">Recherches récentes</Text>
            <Pressable onPress={clearRecent} accessibilityRole="button" hitSlop={12}>
              <Text variant="caption" color="primary">
                Tout effacer
              </Text>
            </Pressable>
          </View>
          {recent.map((q) => (
            <Row
              key={q}
              icon="time-outline"
              label={q}
              onPress={() => onSubmit(q)}
              onRemove={() => removeRecent(q)}
            />
          ))}
        </>
      ) : (
        <View style={{ alignItems: 'center', padding: theme.spacing.xl, gap: theme.spacing.md }}>
          <SceneIllustration kind="search" size={170} />
          <Text variant="title" align="center">
            Que cherchez-vous ?
          </Text>
          <Text color="textMuted" align="center">
            Un produit, une marque ou un rayon.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
            {POPULAR.map((q) => (
              <Chip key={q} role="checkbox" label={q} selected={false} onPress={() => onSubmit(q)} />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  caption,
  emphasis = false,
  onPress,
  onRemove,
}: {
  icon: IconName;
  label: string;
  caption?: string;
  emphasis?: boolean;
  onPress: () => void;
  onRemove?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={caption ? `${label}, ${caption}` : label}
      style={({ pressed }) => [
        styles.row,
        {
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          backgroundColor: pressed ? theme.colors.surfaceAlt : 'transparent',
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={emphasis ? theme.colors.primary : theme.colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text variant={emphasis ? 'bodyStrong' : 'body'} color={emphasis ? 'primary' : 'text'} numberOfLines={1}>
          {label}
        </Text>
        {caption ? (
          <Text variant="caption" color="textMuted">
            {caption}
          </Text>
        ) : null}
      </View>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Retirer ${label} des recherches récentes`}
          style={styles.iconButton}
        >
          <Ionicons name="close" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function NoResults({ filters, onChange }: { filters: CatalogFilters; onChange: (f: CatalogFilters) => void }) {
  const hasFilters = countActiveFilters(filters) > 0;
  return hasFilters ? (
    <EmptyState
      icon="options-outline"
      title="Aucun produit avec ces filtres"
      description={`Des produits correspondent à « ${filters.q ?? ''} », mais pas avec les filtres choisis.`}
      actionLabel="Effacer les filtres"
      onAction={() => onChange({ q: filters.q })}
    />
  ) : (
    <EmptyState
      icon="search-outline"
      art="search"
      title={`Aucun résultat pour « ${filters.q ?? ''} »`}
      description="Vérifiez l'orthographe ou essayez un mot plus simple (riz, huile, savon…)."
      actionLabel="Parcourir les rayons"
      onAction={() => router.navigate('/boutique')}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchSize,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 8,
    minHeight: minTouchSize,
  },
  iconButton: {
    width: minTouchSize,
    height: minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: minTouchSize + 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
});
