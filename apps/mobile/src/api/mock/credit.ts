import { mockOnboardingOptions } from '@afrisime/fixtures';
import {
  type CheckoutCredit,
  CreditAccount,
  type CreditDebt,
  type CreditRepayment,
  allocateRepayment,
  creditDailyAmount,
  debtProgress,
  repaymentError,
} from '@afrisime/shared';
import type { CreditApi } from '@/features/credit/api';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { type MockCreditState, type MockDb, loadDb, saveDb } from './db';
import { PAYMENT_CONFIRM_MS, PAYMENT_FAIL_MS, PAYMENT_TTL_MS } from './orderServer';
import { addCredit } from './storeCredit';
import { mockError, simulate } from './simulate';

/**
 * Vente à crédit du mode démo : mêmes calculs que le serveur. Pour pouvoir essayer sans équipe,
 * une demande est acceptée aussitôt (plafond demandé, plafonné à 100 000 F, 30 jours).
 */

const DAY_MS = 86_400_000;
const DEMO_MAX_LIMIT = 100_000;
const DEMO_TERM_DAYS = 30;
const SUSPENDED_REASON = 'Votre crédit est suspendu. Contactez votre agence AfriSime.';
const LATE_REASON = 'Remboursement en retard : réglez ce qui est dû pour acheter à nouveau à crédit.';
const HINTS = {
  mixx: 'Validez la demande Mixx by Yas reçue sur votre téléphone avec votre code secret.',
  flooz: 'Validez la demande Flooz reçue sur votre téléphone avec votre code secret.',
} as const;
const FAILURE = {
  failed: 'Solde insuffisant ou paiement refusé. Vérifiez votre compte puis réessayez.',
  expired: 'Délai de confirmation dépassé.',
} as const;
const read = <T>(run: () => Promise<T>, signal?: AbortSignal) => withRetry(run, { canRetry: true, signal });
/** Réponses déjà données par clé d'idempotence. */
const replies = new Set<string>();

const stateOf = (db: MockDb, userId: string): MockCreditState =>
  ((db.credit ??= {})[userId] ??= { account: null, request: null, debts: [], repayments: [] });

/** Répartit un remboursement réussi sur les dettes en cours, la plus ancienne d'abord. */
function apply(db: MockDb, userId: string, state: MockCreditState, amount: number, at: number) {
  const open = state.debts.filter((d) => d.status === 'open');
  const allocations = allocateRepayment(
    open.map((d) => ({ ...d, startedAt: new Date(d.startedAt) })),
    amount,
  );
  for (const a of allocations) {
    const d = state.debts.find((x) => x.id === a.id)!;
    d.paid += a.amount;
    if (d.paid >= d.amount) d.status = 'settled';
  }
  const leftover = amount - allocations.reduce((n, a) => n + a.amount, 0);
  if (leftover > 0) addCredit(db, userId, { amount: leftover, reason: 'adjustment', label: 'Trop-perçu sur un remboursement de crédit', at });
}

/** Issue simulée des remboursements Mobile Money en attente (figée une fois atteinte). */
function settle(db: MockDb, userId: string, state: MockCreditState, now: number) {
  for (const r of state.repayments) {
    if (r.status !== 'pending') continue;
    const elapsed = now - Date.parse(r.createdAt);
    const next =
      r.outcome === 'succeed' && elapsed >= PAYMENT_CONFIRM_MS
        ? 'succeeded'
        : r.outcome === 'fail' && elapsed >= PAYMENT_FAIL_MS
          ? 'failed'
          : now >= Date.parse(r.expiresAt)
            ? 'expired'
            : null;
    if (!next) continue;
    r.status = next;
    r.failureReason = next === 'succeeded' ? null : FAILURE[next];
    if (next === 'succeeded') apply(db, userId, state, r.amount, now);
  }
}

function figures(state: MockCreditState, now: number) {
  let used = 0;
  let dueToday = 0;
  let daysLate = 0;
  for (const d of state.debts.filter((x) => x.status === 'open')) {
    const p = debtProgress({ ...d, startedAt: new Date(d.startedAt) }, new Date(now));
    used += p.remaining;
    dueToday += p.dueToday;
    daysLate = Math.max(daysLate, p.daysLate);
  }
  const limit = state.account?.limit ?? 0;
  return { used, dueToday, daysLate, limit, available: Math.max(0, limit - used) };
}

/** Crédit proposé à la commande (null : pas de crédit). */
export function mockCheckoutCredit(db: MockDb, userId: string, now = Date.now()): CheckoutCredit {
  const state = stateOf(db, userId);
  if (!state.account) return null;
  settle(db, userId, state, now);
  const f = figures(state, now);
  return {
    available: f.available,
    blockedReason: state.account.status === 'suspended' ? SUSPENDED_REASON : f.daysLate > 0 ? LATE_REASON : null,
  };
}

/** Achat à crédit : revérifié au moment de commander, puis la dette est créée (modifie `db`). */
export function createMockDebt(db: MockDb, userId: string, order: { id: string; orderNumber: string; total: number }, now: number) {
  const credit = mockCheckoutCredit(db, userId, now);
  if (!credit) throw mockError('CREDIT_NOT_ELIGIBLE', 'Vous n’avez pas de crédit ouvert.', 403);
  if (credit.blockedReason) throw mockError('CREDIT_SUSPENDED', credit.blockedReason, 403);
  if (order.total > credit.available) {
    throw mockError('CREDIT_INSUFFICIENT', `Crédit disponible : ${credit.available} F. Vérifiez votre commande.`, 422);
  }
  const state = stateOf(db, userId);
  const termDays = state.account!.termDays;
  state.debts.push({
    id: `dte_${now.toString(36)}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: order.total,
    paid: 0,
    termDays,
    dailyAmount: creditDailyAmount(order.total, termDays),
    status: 'open',
    startedAt: new Date(now).toISOString(),
    dueAt: new Date(now + termDays * DAY_MS).toISOString(),
  });
}

/** Commande annulée : sa dette est effacée ; ce qui avait été remboursé devient un avoir (modifie `db`). */
export function cancelMockDebt(db: MockDb, userId: string, orderId: string, now: number) {
  const debt = stateOf(db, userId).debts.find((d) => d.orderId === orderId && d.status !== 'cancelled');
  if (!debt) return;
  debt.status = 'cancelled';
  if (debt.paid > 0) addCredit(db, userId, { amount: debt.paid, reason: 'credit_cancelled', orderId, at: now });
}

function toRepayment(r: MockCreditState['repayments'][number]): CreditRepayment {
  return {
    id: r.id,
    amount: r.amount,
    method: r.method,
    status: r.status,
    createdAt: r.createdAt,
    agencyName: null,
    failureReason: r.failureReason,
    action: r.status === 'pending' ? { type: 'confirm_on_phone', url: null, instructions: HINTS[r.method] } : null,
  };
}

function view(db: MockDb, userId: string, requiresReview: boolean, now: number): CreditAccount {
  const state = stateOf(db, userId);
  settle(db, userId, state, now);
  const f = figures(state, now);
  const status = state.account?.status ?? 'none';
  const blockedReason = !state.account
    ? null
    : status === 'suspended'
      ? SUSPENDED_REASON
      : f.daysLate > 0
        ? LATE_REASON
        : f.available <= 0
          ? 'Crédit entièrement utilisé : remboursez pour en disposer à nouveau.'
          : null;
  const debts: CreditDebt[] = [
    ...state.debts.filter((d) => d.status === 'open'),
    ...state.debts.filter((d) => d.status !== 'open').reverse(),
  ].map((d) => {
    const p = debtProgress({ ...d, startedAt: new Date(d.startedAt) }, new Date(now));
    return { ...d, remaining: d.status === 'cancelled' ? 0 : p.remaining, dueToday: p.dueToday, daysLate: p.daysLate };
  });
  const repayments = [...state.repayments].reverse().map(toRepayment);
  return {
    status,
    canRequest: requiresReview && !state.account && state.request?.status !== 'pending',
    limit: f.limit,
    used: f.used,
    available: f.available,
    termDays: state.account?.termDays ?? 0,
    dueToday: f.dueToday,
    daysLate: f.daysLate,
    canBuy: !!state.account && blockedReason === null,
    blockedReason,
    debts,
    repayments,
    pendingRepayment: repayments.find((r) => r.status === 'pending') ?? null,
    request: state.request ? { ...state.request, reason: null } : null,
  };
}

/** Profil professionnel déclaré (en démo, la validation par l'équipe n'est pas simulée). */
const isPro = (customerTypeId: string | null) =>
  mockOnboardingOptions.customerTypes.some((t) => t.id === customerTypeId && t.requiresReview);

async function withCredit<T>(token: string | null, run: (db: MockDb, userId: string, pro: boolean, now: number) => T) {
  const user = await requireUser(token);
  const db = await loadDb();
  const result = run(db, user.id, isPro(user.customerTypeId), Date.now());
  await saveDb({ ...db });
  return result;
}

export const mockCreditApi: CreditApi = {
  getAccount(signal) {
    return read(
      () => withAuth((token) => simulate(CreditAccount, () => withCredit(token, (db, id, pro, now) => view(db, id, pro, now)))),
      signal,
    );
  },
  request(body) {
    return read(() =>
      withAuth((token) =>
        simulate(CreditAccount, () =>
          withCredit(token, (db, id, pro, now) => {
            if (!pro) {
              throw mockError(
                'CREDIT_NOT_ELIGIBLE',
                'Le crédit est réservé aux revendeuses et aux professionnels dont le profil a été validé.',
                403,
              );
            }
            const state = stateOf(db, id);
            if (state.account) throw mockError('VALIDATION_ERROR', 'Vous avez déjà un crédit : demandez à votre agence pour le modifier.', 422);
            state.request = {
              id: `dcr_${now.toString(36)}`,
              amount: body.amount,
              message: body.message ?? null,
              status: 'approved',
              createdAt: new Date(now).toISOString(),
            };
            state.account = { limit: Math.min(body.amount, DEMO_MAX_LIMIT), termDays: DEMO_TERM_DAYS, status: 'active' };
            return view(db, id, pro, now);
          }),
        ),
      ),
    );
  },
  repay(body, key) {
    return read(() =>
      withAuth((token) =>
        simulate(CreditAccount, () =>
          withCredit(token, (db, id, pro, now) => {
            const state = stateOf(db, id);
            settle(db, id, state, now);
            if (replies.has(key) || state.repayments.some((r) => r.status === 'pending')) return view(db, id, pro, now);
            const error = repaymentError(body.amount, figures(state, now).used);
            if (error) throw mockError('VALIDATION_ERROR', error, 422, { field: 'amount' });
            state.repayments.push({
              id: `rmb_${now.toString(36)}`,
              amount: body.amount,
              method: body.method,
              status: 'pending',
              outcome: body.phone.endsWith('0002') ? 'fail' : body.phone.endsWith('0003') ? 'expire' : 'succeed',
              createdAt: new Date(now).toISOString(),
              expiresAt: new Date(now + PAYMENT_TTL_MS).toISOString(),
              failureReason: null,
            });
            replies.add(key);
            return view(db, id, pro, now);
          }),
        ),
      ),
    );
  },
};
