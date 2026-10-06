import { MAX_LINE_QUANTITY, type CartLine } from '@afrisime/shared';
import { useEffect } from 'react';
import { useSession } from '@/features/auth/session';
import { cartApi } from './api';
import { snapshotFromServer, useCart, type LocalCartLine } from './store';

/**
 * Fusion panier visiteur + panier serveur à la connexion.
 * Même format des deux côtés : on garde la PLUS GRANDE quantité (jamais la somme,
 * sinon une reconnexion doublerait le panier). Ordre : lignes locales puis lignes serveur.
 */
export function mergeCartLines(local: CartLine[], server: CartLine[]): CartLine[] {
  const merged = new Map<string, number>();
  for (const l of [...local, ...server]) {
    merged.set(l.variantId, Math.min(MAX_LINE_QUANTITY, Math.max(merged.get(l.variantId) ?? 0, l.quantity)));
  }
  return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}

const toCartLines = (lines: LocalCartLine[]): CartLine[] =>
  lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));

/** Récupère le panier serveur, fusionne, complète les infos produit manquantes, puis renvoie au serveur. */
export async function pullAndMergeCart(): Promise<void> {
  const server = await cartApi.getServerCart();

  // Lignes connues seulement du serveur : la revalidation fournit nom, format, prix…
  const localIds = new Set(useCart.getState().lines.map((l) => l.variantId));
  const serverOnly = server.lines.filter((l) => !localIds.has(l.variantId));
  const fromServer = new Map<string, LocalCartLine>();
  if (serverOnly.length > 0) {
    const validated = await cartApi.validate({
      lines: serverOnly.map((l) => ({ ...l, expectedUnitPrice: null, expectedAvailability: 'available' })),
    });
    for (const v of validated.lines) {
      fromServer.set(v.variantId, {
        variantId: v.variantId,
        quantity: v.requestedQuantity,
        addedAt: Date.now(),
        snapshot: snapshotFromServer(v),
      });
    }
  }

  // Relu APRÈS les appels réseau : une modification faite entre-temps n'est pas écrasée.
  const local = useCart.getState().lines;
  const known = new Map(local.map((l) => [l.variantId, l]));
  const nextLines: LocalCartLine[] = [];
  for (const l of mergeCartLines(toCartLines(local), server.lines)) {
    const line = known.get(l.variantId) ?? fromServer.get(l.variantId);
    if (line) nextLines.push({ ...line, quantity: l.quantity });
  }

  useCart.getState().replaceLines(nextLines);
  await cartApi.putServerCart(toCartLines(nextLines));
}

const PUSH_DEBOUNCE_MS = 1000;

/**
 * Synchronisation du panier pour un client connecté (monté une fois à la racine) :
 * fusion à la connexion / au démarrage, puis envoi débouncé de chaque modification.
 * Échecs silencieux : le panier local reste la référence, il sera renvoyé au prochain changement.
 */
export function useCartSync(): void {
  const userId = useSession((s) => (s.status === 'authenticated' ? s.userId : null));

  useEffect(() => {
    if (!userId) return;
    let ready = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    pullAndMergeCart()
      .catch(() => undefined)
      .finally(() => {
        ready = true;
      });

    const unsubscribe = useCart.subscribe((state, prev) => {
      if (!ready || cancelled || state.lines === prev.lines) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void cartApi.putServerCart(toCartLines(useCart.getState().lines)).catch(() => undefined);
      }, PUSH_DEBOUNCE_MS);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId]);
}

