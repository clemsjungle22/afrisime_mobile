import {
  type CheckoutCredit,
  type CreditAccount,
  type CreditAccountStatus,
  type CreditDebt,
  type CreditDebtStatus,
  type CreditRepayment,
  type CreditRequestBody,
  type CreditRequestStatus,
  type CreditRequestView,
  type PaymentAction,
  type RepayBody,
  type RepaymentMethod,
  allocateRepayment,
  creditDailyAmount,
  debtProgress,
  repaymentError,
} from '@afrisime/shared';
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { addStoreCredit } from '../customers/storeCredit';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { once } from '../idempotency';
import { type ProviderPayment, type ProviderStatus, paymentProvider } from '../payments/provider';

/**
 * Vente à crédit : l'équipe accorde à une cliente pro un plafond et une durée ; chaque commande payée
 * à crédit crée une dette remboursée chaque jour (Mobile Money ou espèces en agence). Un remboursement
 * règle d'abord la dette la plus ancienne. En retard ou suspendue : plus d'achat à crédit.
 */

type Customer = { id: string };
type AccountRow = typeof s.creditAccounts.$inferSelect;
type DebtRow = typeof s.creditDebts.$inferSelect;
type RepaymentRow = typeof s.creditRepayments.$inferSelect;
type RequestRow = typeof s.creditRequests.$inferSelect;
export type RepaymentWithAgency = RepaymentRow & { agencyName: string | null };
type Allocation = { debtId: string; amount: number };

const DAY_MS = 86_400_000;
/** Durée laissée à la cliente pour confirmer sur son téléphone (comme pour une commande). */
const PAYMENT_TTL_MS = 90_000;
const invalid = (message: string, field?: string) =>
  new ApiError('VALIDATION_ERROR', message, field ? { field } : undefined, 422);

export const SUSPENDED_REASON = 'Votre crédit est suspendu. Contactez votre agence AfriSime.';
export const LATE_REASON =
  'Remboursement en retard : réglez ce qui est dû pour acheter à nouveau à crédit.';

/** Événement pour AfriGes (même transaction que le changement). */
const publish = (tx: Db, eventType: string, customerId: string, payload: Record<string, unknown>) =>
  tx.insert(s.outbox).values({ eventType, aggregate: 'credit', aggregateId: customerId, payload });

/** Verrou par cliente pour la durée de la transaction : deux achats ne dépassent jamais le plafond. */
export const lockCredit = (tx: Db, customerId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`loan:${customerId}`}))`);

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** Compte pro validé (profil soumis à validation et accepté) : condition pour obtenir un crédit. */
export async function isProValidated(db: Db, customerId: string): Promise<boolean> {
  const [row] = await db
    .select({
      pending: s.customers.customerTypePending,
      requiresReview: s.customerTypes.requiresReview,
    })
    .from(s.customers)
    .leftJoin(s.customerTypes, eq(s.customerTypes.id, s.customers.customerTypeId))
    .where(eq(s.customers.id, customerId));
  return !!row && !row.pending && row.requiresReview === true;
}

export function toDebt(d: DebtRow & { orderNumber: string }, now: Date): CreditDebt {
  const status = d.status as CreditDebtStatus;
  const progress = debtProgress(
    { amount: d.amount, dailyAmount: d.dailyAmount, paid: d.paid, startedAt: d.startedAt, status },
    now,
  );
  return {
    id: d.id,
    orderId: d.orderId,
    orderNumber: d.orderNumber,
    amount: d.amount,
    paid: d.paid,
    remaining: status === 'cancelled' ? 0 : progress.remaining,
    dailyAmount: d.dailyAmount,
    termDays: d.termDays,
    startedAt: d.startedAt.toISOString(),
    dueAt: d.dueAt.toISOString(),
    status,
    dueToday: progress.dueToday,
    daysLate: progress.daysLate,
  };
}

export function toRepayment(r: RepaymentWithAgency): CreditRepayment {
  return {
    id: r.id,
    amount: r.amount,
    method: r.method as RepaymentMethod,
    status: r.status as CreditRepayment['status'],
    createdAt: r.createdAt.toISOString(),
    agencyName: r.agencyName,
    failureReason: r.failureReason,
    action:
      r.status === 'pending'
        ? ((r.providerData as { action?: PaymentAction } | null)?.action ?? null)
        : null,
  };
}

export function toRequest(r: RequestRow): CreditRequestView {
  return {
    id: r.id,
    amount: r.amount,
    message: r.message,
    status: r.status as CreditRequestStatus,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Dettes d'une ou plusieurs clientes (les plus anciennes d'abord), avec le numéro de commande. */
export async function debtsOf(db: Db, customerIds: string[], onlyOpen = false) {
  if (customerIds.length === 0) return [];
  return (
    await db
      .select({ d: s.creditDebts, orderNumber: s.orders.orderNumber })
      .from(s.creditDebts)
      .innerJoin(s.orders, eq(s.orders.id, s.creditDebts.orderId))
      .where(
        and(
          inArray(s.creditDebts.customerId, customerIds),
          onlyOpen ? eq(s.creditDebts.status, 'open') : undefined,
        ),
      )
      .orderBy(s.creditDebts.startedAt)
  ).map(({ d, orderNumber }) => ({ ...d, orderNumber }));
}

export async function repaymentsOf(
  db: Db,
  customerId: string,
  limit = 50,
): Promise<RepaymentWithAgency[]> {
  const rows = await db
    .select({ r: s.creditRepayments, agencyName: s.agencies.name })
    .from(s.creditRepayments)
    .leftJoin(s.agencies, eq(s.agencies.id, s.creditRepayments.agencyId))
    .where(eq(s.creditRepayments.customerId, customerId))
    .orderBy(desc(s.creditRepayments.createdAt))
    .limit(limit);
  return rows.map(({ r, agencyName }) => ({ ...r, agencyName }));
}

/** Chiffres d'un crédit : encours, disponible, dû du jour, retard, et si l'achat à crédit est possible. */
export function creditFigures(account: AccountRow | null, openDebts: DebtRow[], now: Date) {
  let used = 0;
  let dueToday = 0;
  let daysLate = 0;
  for (const d of openDebts) {
    const p = debtProgress(
      {
        amount: d.amount,
        dailyAmount: d.dailyAmount,
        paid: d.paid,
        startedAt: d.startedAt,
        status: 'open',
      },
      now,
    );
    used += p.remaining;
    dueToday += p.dueToday;
    daysLate = Math.max(daysLate, p.daysLate);
  }
  const status: CreditAccountStatus = account ? (account.status as CreditAccountStatus) : 'none';
  const limit = account?.limit ?? 0;
  const available = Math.max(0, limit - used);
  const blockedReason = !account
    ? 'Vous n’avez pas de crédit ouvert.'
    : status === 'suspended'
      ? SUSPENDED_REASON
      : daysLate > 0
        ? LATE_REASON
        : available <= 0
          ? 'Crédit entièrement utilisé : remboursez pour en disposer à nouveau.'
          : null;
  return {
    status,
    limit,
    used,
    available,
    dueToday,
    daysLate,
    blockedReason,
    canBuy: blockedReason === null,
  };
}

async function loadAccount(db: Db, customerId: string) {
  const [account] = await db
    .select()
    .from(s.creditAccounts)
    .where(eq(s.creditAccounts.customerId, customerId));
  return account ?? null;
}

/** Crédit proposé à la commande (null : pas de crédit, l'option n'est pas affichée). */
export async function checkoutCredit(
  db: Db,
  customerId: string,
  now = new Date(),
): Promise<CheckoutCredit> {
  const account = await loadAccount(db, customerId);
  if (!account) return null;
  const figures = creditFigures(account, await debtsOf(db, [customerId], true), now);
  return {
    available: figures.available,
    blockedReason:
      figures.status === 'suspended' ? SUSPENDED_REASON : figures.daysLate > 0 ? LATE_REASON : null,
  };
}

export async function getCreditAccount(
  db: Db,
  customer: Customer,
  now = new Date(),
): Promise<CreditAccount> {
  await refreshPending(db, customer.id, now);
  const [account, debts, repayments, requests, pro] = await Promise.all([
    loadAccount(db, customer.id),
    debtsOf(db, [customer.id]),
    repaymentsOf(db, customer.id),
    db
      .select()
      .from(s.creditRequests)
      .where(eq(s.creditRequests.customerId, customer.id))
      .orderBy(desc(s.creditRequests.createdAt))
      .limit(1),
    isProValidated(db, customer.id),
  ]);
  const figures = creditFigures(
    account,
    debts.filter((d) => d.status === 'open'),
    now,
  );
  const request = requests[0] ?? null;
  const list = repayments.map(toRepayment);
  return {
    status: figures.status,
    canRequest: pro && !account && request?.status !== 'pending',
    limit: figures.limit,
    used: figures.used,
    available: figures.available,
    termDays: account?.termDays ?? 0,
    dueToday: figures.dueToday,
    daysLate: figures.daysLate,
    canBuy: figures.canBuy,
    blockedReason: account ? figures.blockedReason : null,
    // Dettes en cours d'abord (les plus anciennes en tête), puis les réglées et annulées récentes.
    debts: [
      ...debts.filter((d) => d.status === 'open'),
      ...debts
        .filter((d) => d.status !== 'open')
        .reverse()
        .slice(0, 20),
    ].map((d) => toDebt(d, now)),
    repayments: list,
    pendingRepayment: list.find((r) => r.status === 'pending') ?? null,
    request: request ? toRequest(request) : null,
  };
}

// ─── Demande de crédit ───────────────────────────────────────────────────────

export async function requestCredit(
  db: Db,
  customer: Customer,
  body: CreditRequestBody,
  now = new Date(),
) {
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    await lockCredit(tx, customer.id);
    if (!(await isProValidated(tx, customer.id))) {
      throw new ApiError(
        'CREDIT_NOT_ELIGIBLE',
        'Le crédit est réservé aux revendeuses et aux professionnels dont le profil a été validé.',
        undefined,
        403,
      );
    }
    if (await loadAccount(tx, customer.id))
      throw invalid('Vous avez déjà un crédit : demandez à votre agence pour le modifier.');
    const [pending] = await tx
      .select({ id: s.creditRequests.id })
      .from(s.creditRequests)
      .where(
        and(eq(s.creditRequests.customerId, customer.id), eq(s.creditRequests.status, 'pending')),
      );
    if (pending) throw invalid('Votre demande est déjà en cours d’examen.');
    const id = newId('dcr');
    await tx.insert(s.creditRequests).values({
      id,
      customerId: customer.id,
      amount: body.amount,
      message: body.message ?? null,
      createdAt: now,
    });
    await publish(tx, 'credit.requested', customer.id, { requestId: id, amount: body.amount });
  });
  return getCreditAccount(db, customer, now);
}

// ─── Dettes (achat à crédit, annulation) ─────────────────────────────────────

/**
 * Achat à crédit (dans la transaction de la commande) : crédit revérifié sous verrou, puis dette créée
 * avec la durée et le versement journalier du moment.
 */
export async function createDebt(
  tx: Db,
  input: { customerId: string; orderId: string; amount: number; now: Date },
) {
  await lockCredit(tx, input.customerId);
  const account = await loadAccount(tx, input.customerId);
  if (!account)
    throw new ApiError('CREDIT_NOT_ELIGIBLE', 'Vous n’avez pas de crédit ouvert.', undefined, 403);
  const figures = creditFigures(account, await debtsOf(tx, [input.customerId], true), input.now);
  if (figures.status === 'suspended')
    throw new ApiError('CREDIT_SUSPENDED', SUSPENDED_REASON, undefined, 403);
  if (figures.daysLate > 0) throw new ApiError('CREDIT_SUSPENDED', LATE_REASON, undefined, 403);
  if (input.amount > figures.available) {
    throw new ApiError(
      'CREDIT_INSUFFICIENT',
      `Crédit disponible : ${figures.available} F. Vérifiez votre commande.`,
      { available: figures.available },
      422,
    );
  }
  await tx.insert(s.creditDebts).values({
    id: newId('dte'),
    customerId: input.customerId,
    orderId: input.orderId,
    amount: input.amount,
    termDays: account.termDays,
    dailyAmount: creditDailyAmount(input.amount, account.termDays),
    startedAt: input.now,
    dueAt: new Date(input.now.getTime() + account.termDays * DAY_MS),
    createdAt: input.now,
    updatedAt: input.now,
  });
  await publish(tx, 'credit.debt_created', input.customerId, {
    orderId: input.orderId,
    amount: input.amount,
  });
}

/** Commande annulée : sa dette est effacée ; ce qui avait déjà été remboursé devient un avoir. */
export async function cancelDebt(tx: Db, orderId: string, at: Date) {
  const [debt] = await tx
    .update(s.creditDebts)
    .set({ status: 'cancelled', updatedAt: at })
    .where(
      and(eq(s.creditDebts.orderId, orderId), inArray(s.creditDebts.status, ['open', 'settled'])),
    )
    .returning();
  if (!debt) return;
  if (debt.paid > 0) {
    await addStoreCredit(tx, {
      customerId: debt.customerId,
      amount: debt.paid,
      reason: 'credit_cancelled',
      orderId,
      at,
    });
  }
  await publish(tx, 'credit.debt_cancelled', debt.customerId, {
    orderId,
    amount: debt.amount,
    refunded: debt.paid,
  });
}

// ─── Remboursements ──────────────────────────────────────────────────────────

/**
 * Répartit un remboursement réussi sur les dettes en cours, la plus ancienne d'abord (dans la transaction
 * de l'appelant). Un éventuel trop-perçu (dette annulée entre-temps) devient un avoir.
 */
export async function applyRepayment(tx: Db, r: RepaymentRow, at: Date) {
  await lockCredit(tx, r.customerId);
  const open = await tx
    .select()
    .from(s.creditDebts)
    .where(and(eq(s.creditDebts.customerId, r.customerId), eq(s.creditDebts.status, 'open')));
  const allocations: Allocation[] = allocateRepayment(open, r.amount).map((a) => ({
    debtId: a.id,
    amount: a.amount,
  }));
  for (const a of allocations) {
    const [d] = await tx
      .update(s.creditDebts)
      .set({ paid: sql`${s.creditDebts.paid} + ${a.amount}`, updatedAt: at })
      .where(eq(s.creditDebts.id, a.debtId))
      .returning();
    if (d && d.paid >= d.amount) {
      await tx
        .update(s.creditDebts)
        .set({ status: 'settled', settledAt: at, updatedAt: at })
        .where(eq(s.creditDebts.id, d.id));
    }
  }
  await tx.update(s.creditRepayments).set({ allocations }).where(eq(s.creditRepayments.id, r.id));
  const leftover = r.amount - allocations.reduce((n, a) => n + a.amount, 0);
  if (leftover > 0) {
    await addStoreCredit(tx, {
      customerId: r.customerId,
      amount: leftover,
      reason: 'adjustment',
      note: 'Trop-perçu sur un remboursement de crédit',
      at,
    });
  }
  await publish(tx, 'credit.repayment_received', r.customerId, {
    repaymentId: r.id,
    amount: r.amount,
    method: r.method,
  });
}

function toProviderPayment(r: RepaymentRow): ProviderPayment {
  return {
    id: r.id,
    method: r.method as 'mixx' | 'flooz',
    amount: r.amount,
    phone: r.phone ?? '',
    createdAt: r.createdAt,
    expiresAt: r.expiresAt ?? r.createdAt,
    providerReference: r.providerReference,
    providerData: (r.providerData as { provider?: unknown } | null)?.provider ?? null,
  };
}

/** Enregistre l'issue d'un remboursement Mobile Money UNE seule fois ; réussi, il est réparti sur les dettes. */
export async function settleRepayment(
  db: Db,
  repaymentId: string,
  status: Exclude<ProviderStatus, 'pending'>,
  failureReason: string | null,
  at = new Date(),
): Promise<boolean> {
  return db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const [r] = await tx
      .update(s.creditRepayments)
      .set({ status, failureReason, settledAt: at })
      .where(and(eq(s.creditRepayments.id, repaymentId), eq(s.creditRepayments.status, 'pending')))
      .returning();
    if (!r) return false;
    if (status === 'succeeded') await applyRepayment(tx, r, at);
    return true;
  });
}

async function refreshRepayment(db: Db, r: RepaymentRow, now: Date) {
  if (r.status !== 'pending' || !r.provider) return;
  const result = await paymentProvider(r.provider).fetchStatus(toProviderPayment(r), now);
  if (result.status !== 'pending')
    await settleRepayment(db, r.id, result.status, result.failureReason, now);
}

async function refreshPending(db: Db, customerId: string, now: Date) {
  const pending = await db
    .select()
    .from(s.creditRepayments)
    .where(
      and(eq(s.creditRepayments.customerId, customerId), eq(s.creditRepayments.status, 'pending')),
    );
  for (const r of pending) await refreshRepayment(db, r, now);
}

/** Webhook d'un prestataire pour un remboursement (référence inconnue des commandes et des carnets). */
export async function settleRepaymentByReference(
  db: Db,
  provider: string,
  reference: string,
  status: Exclude<ProviderStatus, 'pending'>,
  failureReason: string | null,
): Promise<boolean> {
  const [r] = await db
    .select({ id: s.creditRepayments.id })
    .from(s.creditRepayments)
    .where(
      and(
        eq(s.creditRepayments.provider, provider),
        eq(s.creditRepayments.providerReference, reference),
      ),
    );
  if (!r) return false;
  await settleRepayment(db, r.id, status, failureReason);
  return true;
}

/** Tâche périodique : remboursements encore en attente depuis au moins `olderThanMs`. */
export async function refreshPendingRepayments(db: Db, now: Date, olderThanMs = 10_000) {
  const rows = await db
    .select()
    .from(s.creditRepayments)
    .where(
      and(
        eq(s.creditRepayments.status, 'pending'),
        lte(s.creditRepayments.createdAt, new Date(now.getTime() - olderThanMs)),
      ),
    );
  for (const r of rows) await refreshRepayment(db, r, now);
  return rows.length;
}

/** Encours restant (dettes en cours). */
export async function outstandingOf(db: Db, customerId: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${s.creditDebts.amount} - ${s.creditDebts.paid}), 0)::int`,
    })
    .from(s.creditDebts)
    .where(and(eq(s.creditDebts.customerId, customerId), eq(s.creditDebts.status, 'open')));
  return Number(row?.total ?? 0);
}

/**
 * Rembourser par Mobile Money. Jamais deux demandes en cours : une demande encore active est renvoyée
 * telle quelle (double appui, reconnexion).
 */
export async function repay(
  db: Db,
  customer: Customer,
  body: RepayBody,
  key: string,
  now = new Date(),
): Promise<CreditAccount> {
  await refreshPending(db, customer.id, now);
  return once(
    db,
    { customerId: customer.id, key, route: 'POST /v1/me/credit/repayments', body },
    async (tx) => {
      await lockCredit(tx, customer.id);
      const [active] = await tx
        .select({ id: s.creditRepayments.id })
        .from(s.creditRepayments)
        .where(
          and(
            eq(s.creditRepayments.customerId, customer.id),
            eq(s.creditRepayments.status, 'pending'),
          ),
        );
      if (active) return customer.id;
      const error = repaymentError(body.amount, await outstandingOf(tx, customer.id));
      if (error) throw invalid(error, 'amount');

      const provider = paymentProvider();
      const id = newId('rmb');
      const draft: ProviderPayment = {
        id,
        method: body.method,
        amount: body.amount,
        phone: body.phone,
        createdAt: now,
        expiresAt: new Date(now.getTime() + PAYMENT_TTL_MS),
        providerReference: null,
        providerData: null,
      };
      // Appel au prestataire dans la transaction : si la demande échoue, rien n'est enregistré.
      const started = await provider.initiate(draft);
      await tx.insert(s.creditRepayments).values({
        id,
        customerId: customer.id,
        method: body.method,
        amount: body.amount,
        status: 'pending',
        provider: provider.name,
        providerReference: started.reference,
        providerData: { provider: started.data, action: started.action },
        phone: body.phone,
        expiresAt: draft.expiresAt,
        createdAt: now,
      });
      return customer.id;
    },
    () => getCreditAccount(db, customer, now),
  );
}
