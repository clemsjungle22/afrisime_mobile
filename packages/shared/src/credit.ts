import { z } from 'zod';
import { PhoneE164 } from './auth';
import { Money } from './money';
import { PaymentAction } from './orders';

/**
 * Vente à crédit (/v1/me/credit) : réservée aux comptes pros, accordée par l'équipe (plafond, durée).
 * Chaque achat à crédit crée une dette remboursée chaque jour ; ce qui est remboursé redevient disponible.
 */

const DAY_MS = 86_400_000;

export const CREDIT_MIN_REQUEST = 5_000;
export const CREDIT_MIN_REPAYMENT = 100;

export const CreditAccountStatus = z.enum(['none', 'active', 'suspended']);
export type CreditAccountStatus = z.infer<typeof CreditAccountStatus>;

export const CreditRequestStatus = z.enum(['pending', 'approved', 'rejected']);
export type CreditRequestStatus = z.infer<typeof CreditRequestStatus>;

export const CreditDebtStatus = z.enum(['open', 'settled', 'cancelled']);
export type CreditDebtStatus = z.infer<typeof CreditDebtStatus>;

export const RepaymentMethod = z.enum(['mixx', 'flooz', 'cash']);
export type RepaymentMethod = z.infer<typeof RepaymentMethod>;

export const REPAYMENT_METHOD_LABELS: Record<RepaymentMethod, string> = {
  mixx: 'Mixx by Yas',
  flooz: 'Moov Money (Flooz)',
  cash: 'En agence',
};

export const CreditDebt = z.object({
  id: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
  amount: Money,
  paid: Money,
  remaining: Money,
  dailyAmount: Money,
  termDays: z.number().int().positive(),
  startedAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  status: CreditDebtStatus,
  /** Montant à verser pour être à jour aujourd'hui. */
  dueToday: Money,
  daysLate: z.number().int().nonnegative(),
});
export type CreditDebt = z.infer<typeof CreditDebt>;

export const CreditRepayment = z.object({
  id: z.string(),
  amount: Money,
  method: RepaymentMethod,
  status: z.enum(['pending', 'succeeded', 'failed', 'expired']),
  createdAt: z.string().datetime(),
  agencyName: z.string().nullable(),
  failureReason: z.string().nullable(),
  action: PaymentAction.nullable(),
});
export type CreditRepayment = z.infer<typeof CreditRepayment>;

export const CreditRequestView = z.object({
  id: z.string(),
  amount: Money,
  message: z.string().nullable(),
  status: CreditRequestStatus,
  /** Motif du refus. */
  reason: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type CreditRequestView = z.infer<typeof CreditRequestView>;

/** GET /v1/me/credit */
export const CreditAccount = z.object({
  status: CreditAccountStatus,
  /** Compte pro validé sans crédit ni demande en cours : peut demander un crédit. */
  canRequest: z.boolean(),
  limit: Money,
  /** Encours : reste à rembourser sur les achats à crédit. */
  used: Money,
  available: Money,
  termDays: z.number().int().nonnegative(),
  dueToday: Money,
  daysLate: z.number().int().nonnegative(),
  /** Peut acheter à crédit maintenant (actif, sans retard). */
  canBuy: z.boolean(),
  /** Pourquoi l'achat à crédit est bloqué (affichable), null sinon. */
  blockedReason: z.string().nullable(),
  debts: z.array(CreditDebt),
  repayments: z.array(CreditRepayment),
  pendingRepayment: CreditRepayment.nullable(),
  /** Dernière demande de crédit. */
  request: CreditRequestView.nullable(),
});
export type CreditAccount = z.infer<typeof CreditAccount>;

/** POST /v1/me/credit/requests */
export const CreditRequestBody = z.object({
  amount: z
    .number()
    .int()
    .min(CREDIT_MIN_REQUEST, `Montant minimum : ${CREDIT_MIN_REQUEST} F`)
    .max(10_000_000),
  message: z
    .string()
    .trim()
    .max(400)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type CreditRequestBody = z.infer<typeof CreditRequestBody>;

/** POST /v1/me/credit/repayments (Idempotency-Key obligatoire). */
export const RepayBody = z.object({
  amount: z.number().int().min(1),
  method: z.enum(['mixx', 'flooz']),
  phone: PhoneE164,
});
export type RepayBody = z.infer<typeof RepayBody>;

// ─── Calculs communs (serveur et mode démo) ──────────────────────────────────

const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * Où en est une dette : le premier versement est attendu le lendemain de l'achat ; le jour même,
 * le versement du jour peut encore être fait (seuls les jours passés comptent dans le retard).
 */
export function debtProgress(
  debt: {
    amount: number;
    dailyAmount: number;
    paid: number;
    startedAt: Date;
    status: CreditDebtStatus;
  },
  now: Date,
): { dueToday: number; daysLate: number; remaining: number } {
  const remaining = Math.max(0, debt.amount - debt.paid);
  if (debt.status !== 'open') return { dueToday: 0, daysLate: 0, remaining };
  const days = Math.max(0, Math.floor((dayStart(now) - dayStart(debt.startedAt)) / DAY_MS));
  const dueByToday = Math.min(debt.amount, debt.dailyAmount * days);
  const dueBeforeToday = Math.min(debt.amount, debt.dailyAmount * Math.max(0, days - 1));
  return {
    dueToday: Math.max(0, dueByToday - debt.paid),
    daysLate:
      dueBeforeToday > debt.paid ? Math.ceil((dueBeforeToday - debt.paid) / debt.dailyAmount) : 0,
    remaining,
  };
}

/** Un remboursement règle d'abord les dettes les plus anciennes ; renvoie le montant affecté à chacune. */
export function allocateRepayment(
  debts: readonly { id: string; amount: number; paid: number; startedAt: Date }[],
  amount: number,
): { id: string; amount: number }[] {
  let left = amount;
  const out: { id: string; amount: number }[] = [];
  for (const d of [...debts].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, d.amount - d.paid));
    if (take > 0) {
      out.push({ id: d.id, amount: take });
      left -= take;
    }
  }
  return out;
}

export const creditDailyAmount = (amount: number, termDays: number) =>
  Math.ceil(amount / Math.max(1, termDays));

/** Montant d'un remboursement : au moins 100 F (ou le reste s'il est plus petit), jamais plus que l'encours. */
export function repaymentError(amount: number, outstanding: number): string | null {
  if (outstanding <= 0) return 'Vous n’avez rien à rembourser.';
  if (amount > outstanding) return `Il ne reste que ${outstanding} F à rembourser.`;
  if (amount < Math.min(CREDIT_MIN_REPAYMENT, outstanding))
    return `Remboursement minimum : ${CREDIT_MIN_REPAYMENT} F.`;
  return null;
}
