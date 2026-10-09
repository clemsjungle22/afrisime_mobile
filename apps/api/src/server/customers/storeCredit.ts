import {
  STORE_CREDIT_REASON_LABELS,
  type StoreCredit,
  type StoreCreditReason,
} from '@afrisime/shared';
import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { newId } from '../ids';

/**
 * Avoir des clients (registre en ajout seul) : crédité à l'abandon d'un carnet, débité par une commande,
 * rendu si la commande est annulée.
 */

export async function storeCreditBalance(db: Db, customerId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${s.storeCreditEntries.amount}), 0)::int` })
    .from(s.storeCreditEntries)
    .where(eq(s.storeCreditEntries.customerId, customerId));
  return Number(row?.total ?? 0);
}

export async function getStoreCredit(db: Db, customerId: string): Promise<StoreCredit> {
  const [balance, rows] = await Promise.all([
    storeCreditBalance(db, customerId),
    db
      .select()
      .from(s.storeCreditEntries)
      .where(eq(s.storeCreditEntries.customerId, customerId))
      .orderBy(desc(s.storeCreditEntries.createdAt))
      .limit(50),
  ]);
  return {
    balance,
    entries: rows.map((r) => {
      const reason = r.reason as StoreCreditReason;
      return {
        id: r.id,
        amount: r.amount,
        reason,
        label: r.note ?? STORE_CREDIT_REASON_LABELS[reason] ?? r.reason,
        at: r.createdAt.toISOString(),
      };
    }),
  };
}

/** Verrou par client pour la durée de la transaction : deux commandes ne dépensent pas le même avoir. */
export const lockStoreCredit = (tx: Db, customerId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`credit:${customerId}`}))`);

/**
 * Mouvement d'avoir. Sans effet s'il a déjà été enregistré pour cette commande ou ce carnet avec ce motif
 * (rejouable) ; renvoie true si le mouvement a été ajouté.
 */
export async function addStoreCredit(
  tx: Db,
  entry: {
    customerId: string;
    amount: number;
    reason: StoreCreditReason;
    carnetId?: string | null;
    orderId?: string | null;
    note?: string | null;
    at?: Date;
  },
): Promise<boolean> {
  if (entry.amount === 0) return false;
  const rows = await tx
    .insert(s.storeCreditEntries)
    .values({
      id: newId('avr'),
      customerId: entry.customerId,
      amount: entry.amount,
      reason: entry.reason,
      carnetId: entry.carnetId ?? null,
      orderId: entry.orderId ?? null,
      note: entry.note ?? null,
      createdAt: entry.at ?? new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: s.storeCreditEntries.id });
  return rows.length > 0;
}
