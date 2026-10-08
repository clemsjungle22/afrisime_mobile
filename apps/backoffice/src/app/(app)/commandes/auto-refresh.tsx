'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Rafraîchit la page à intervalle régulier (nouvelles commandes), seulement si l'onglet est visible. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
