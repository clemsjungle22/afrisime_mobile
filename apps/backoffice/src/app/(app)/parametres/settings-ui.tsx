'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import type { Result } from './actions';

/**
 * Exécute une action des paramètres : bouton « en cours », message d'erreur lisible,
 * page rafraîchie après succès (puis `onDone`, ex. fermer la fenêtre).
 */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = <T,>(call: () => Promise<Result<T>>, onDone?: (data: T) => void) =>
    start(async () => {
      setError(null);
      const res = await call();
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone?.(res.data);
    });
  return { pending, error, setError, run };
}

/** Monter / descendre dans l'ordre d'affichage de l'app. */
export function MoveButtons({
  label,
  first,
  last,
  disabled,
  onMove,
}: {
  label: string;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (direction: 'up' | 'down') => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Monter ${label}`}
        disabled={first || disabled}
        onClick={() => onMove('up')}
      >
        <ArrowUp className="size-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Descendre ${label}`}
        disabled={last || disabled}
        onClick={() => onMove('down')}
      >
        <ArrowDown className="size-4" aria-hidden />
      </Button>
    </>
  );
}

/** Champ texte → nombre entier (vide → 0). */
export const toInt = (value: FormDataEntryValue | null) =>
  Math.round(Number(String(value ?? '').replace(/\s/g, '')) || 0);
