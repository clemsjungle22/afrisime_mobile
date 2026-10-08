import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Relance une requête à chaque RETOUR sur l'écran (le premier affichage la déclenche déjà).
 * Ex. revenir sur le suivi d'une commande après avoir consulté autre chose.
 */
export function useRefetchOnFocus(refetch: () => unknown): void {
  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) void refetch();
      focusedOnce.current = true;
    }, [refetch]),
  );
}
