import { useEffect, useState } from 'react';

/** Valeur stabilisée après `delayMs` sans changement (saisie de recherche, aperçu de filtres). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
