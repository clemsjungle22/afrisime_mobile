import { z } from 'zod';

/** Montant en FCFA (XOF) : entier, jamais de décimales ni de float. */
export const Money = z.number().int().nonnegative();
export type Money = z.infer<typeof Money>;

export const Currency = z.literal('XOF');
export type Currency = z.infer<typeof Currency>;

/** Espace insécable : un montant ne doit jamais être coupé en fin de ligne. */
const NBSP = ' ';

/**
 * Formate un montant entier en FCFA : 12500 → "12 500 FCFA" (espaces insécables).
 * Implémenté sans Intl : le support Intl de Hermes varie selon les appareils Android.
 * Lève une RangeError si le montant n'est pas un entier sûr (signe d'un calcul en float).
 */
export function formatFCFA(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`formatFCFA attend un entier, reçu : ${amount}`);
  }
  const digits = Math.abs(amount).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const sign = amount < 0 ? '-' : '';
  return `${sign}${grouped}${NBSP}FCFA`;
}
