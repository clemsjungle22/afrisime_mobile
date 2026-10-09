import { STORE_CREDIT_REASON_LABELS, StoreCredit, type StoreCreditReason } from '@afrisime/shared';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { type MockDb, loadDb } from './db';
import { simulate } from './simulate';

/** Avoir du mode démo : registre en ajout seul, comme le serveur. */

export function creditBalance(db: MockDb, userId: string): number {
  return (db.storeCredit?.[userId] ?? []).reduce((n, e) => n + e.amount, 0);
}

/**
 * Ajoute un mouvement (modifie `db`, à enregistrer par l'appelant). Sans effet si le même motif
 * a déjà été enregistré pour cette commande ou ce carnet.
 */
export function addCredit(
  db: MockDb,
  userId: string,
  entry: { amount: number; reason: StoreCreditReason; orderId?: string | null; carnetId?: string | null; label?: string | null; at: number },
): void {
  if (entry.amount === 0) return;
  db.storeCredit ??= {};
  const entries = (db.storeCredit[userId] ??= []);
  const duplicate = entries.some(
    (e) =>
      e.reason === entry.reason &&
      ((entry.orderId && e.orderId === entry.orderId) || (entry.carnetId && e.carnetId === entry.carnetId)),
  );
  if (duplicate) return;
  entries.push({
    id: `avr_${entry.at.toString(36)}_${entries.length}`,
    amount: entry.amount,
    reason: entry.reason,
    label: entry.label ?? null,
    at: new Date(entry.at).toISOString(),
    orderId: entry.orderId ?? null,
    carnetId: entry.carnetId ?? null,
  });
}

export function getMockStoreCredit(signal?: AbortSignal): Promise<StoreCredit> {
  return withRetry(
    () =>
      withAuth((token) =>
        simulate(StoreCredit, async () => {
          const user = await requireUser(token);
          const db = await loadDb();
          return {
            balance: creditBalance(db, user.id),
            entries: [...(db.storeCredit?.[user.id] ?? [])].reverse().map((e) => ({
              id: e.id,
              amount: e.amount,
              reason: e.reason,
              label: e.label ?? STORE_CREDIT_REASON_LABELS[e.reason],
              at: e.at,
            })),
          };
        }),
      ),
    { canRetry: true, signal },
  );
}
