import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { parseFilterParams, toFilterParams, type CatalogFilters } from './filters';

/**
 * Filtres stockés dans les paramètres de route : retour arrière, liens et
 * restauration d'écran fonctionnent sans état caché.
 */
export function useFilterParams() {
  const params = useLocalSearchParams();
  const signature = JSON.stringify(params);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- identité stable tant que l'URL ne change pas
  const filters = useMemo(() => parseFilterParams(params), [signature]);

  const setFilters = useCallback((next: CatalogFilters) => {
    router.setParams(toFilterParams(next));
  }, []);

  return { filters, setFilters };
}
