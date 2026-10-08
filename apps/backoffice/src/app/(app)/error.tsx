'use client';

import { RefreshCw, ServerCrash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Erreur pendant l'affichage d'une page (serveur AfriSime injoignable, base lente…) :
 * message clair et nouvel essai, au lieu d'un écran d'erreur technique.
 * Le détail est dans le terminal du back-office et dans les journaux de l'API (identifiant `digest`).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return (
    <Card className="mx-auto mt-10 max-w-lg p-8 text-center">
      <span
        className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-50 text-warning"
        aria-hidden
      >
        <ServerCrash className="size-6" />
      </span>
      <h1 className="mt-4 text-xl font-extrabold text-ink">Le serveur n’a pas répondu à temps</h1>
      <p className="mt-2 text-sm text-muted">
        La connexion à la base de données est peut-être lente en ce moment. Réessayez dans quelques
        secondes.
      </p>
      <Button className="mt-6" onClick={retry}>
        <RefreshCw className="size-4" aria-hidden />
        Réessayer
      </Button>
      {error.digest ? (
        <p className="mt-4 text-xs text-muted/70">Référence : {error.digest}</p>
      ) : null}
    </Card>
  );
}
