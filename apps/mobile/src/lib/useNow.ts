import { useEffect, useState } from 'react';

/**
 * Heure courante (ms), rafraîchie toutes les `intervalMs` tant que `active` est vrai.
 * À utiliser au lieu de `Date.now()` pendant le rendu (un rendu doit rester pur).
 */
export function useNow(intervalMs = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}
