import type { FacetKey } from '@afrisime/shared';
import { useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { OfflineBanner } from '@/components/ui';
import { defaultSort, type CatalogFilters } from '../filters';
import { useProducts } from '../hooks';
import { FilterBar } from './FilterBar';
import { FilterSheet } from './FilterSheet';
import { ProductGrid } from './ProductGrid';
import { SortSheet } from './SortSheet';

type Props = {
  filters: CatalogFilters;
  onChange: (filters: CatalogFilters) => void;
  /** Filtres pilotés par l'écran lui-même (ex. rayon via les onglets de la Boutique). */
  hide?: ReadonlyArray<FacetKey>;
  /** Contenu au-dessus des résultats (correction orthographique, description du rayon…). */
  header?: (products: ReturnType<typeof useProducts>) => ReactElement | null;
  empty: (products: ReturnType<typeof useProducts>) => ReactElement;
  bottomSpace?: number;
};

/** Barre filtres/tri + grille de résultats + panneaux, branchés sur les mêmes filtres. */
export function FilteredProducts({ filters, onChange, hide = [], header, empty, bottomSpace }: Props) {
  const products = useProducts(filters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <FilterBar
        filters={filters}
        facets={products.facets}
        total={products.data ? products.total : null}
        onChange={onChange}
        onOpenFilters={() => setFiltersOpen(true)}
        onOpenSort={() => setSortOpen(true)}
        ignore={hide}
      />
      <OfflineBanner updatedAt={products.dataUpdatedAt} />
      <ProductGrid products={products} header={header?.(products)} empty={empty(products)} bottomSpace={bottomSpace} />
      <FilterSheet
        visible={filtersOpen}
        filters={filters}
        facets={products.facets}
        hide={hide}
        onApply={onChange}
        onClose={() => setFiltersOpen(false)}
      />
      <SortSheet
        visible={sortOpen}
        value={filters.sort ?? defaultSort(filters)}
        allowRelevance={!!filters.q}
        onSelect={(sort) => onChange({ ...filters, sort })}
        onClose={() => setSortOpen(false)}
      />
    </View>
  );
}
