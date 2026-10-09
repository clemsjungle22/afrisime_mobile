import {
  type AdminCreditCashBody,
  type AdminCreditDetail,
  type AdminCreditFilter,
  type AdminCreditGrantBody,
  type AdminCreditList,
  type AdminCreditListQuery,
  type AdminCreditRejectBody,
  type AdminCreditRow,
  type AdminCreditSuspendBody,
  type AdminRole,
  normalize,
  repaymentError,
} from '@afrisime/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../catalog/service';
import {
  applyRepayment,
  creditFigures,
  debtsOf,
  isProValidated,
  lockCredit,
  outstandingOf,
  repaymentsOf,
  toDebt,
  toRepayment,
  toRequest,
} from '../credit/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { type AdminContext, adminAudit } from './auth';
import { CUSTOMER_VIEW_ROLES } from './customers';
import { CASH_ROLES } from './packs';

/** Suivi des crédits (données personnelles) : comme les clients. */
export const CREDIT_VIEW_ROLES = CUSTOMER_VIEW_ROLES;
/** Accorder, modifier, suspendre un crédit ou refuser une demande : administrateur seulement. */
export const CREDIT_MANAGE_ROLES: readonly AdminRole[] = ['admin'];
/** Encaisser un remboursement en espèces : comme les cotisations de carnet (comptoir). */
export const CREDIT_CASH_ROLES = CASH_ROLES;

const PAGE = 50;
const notFound = () => new ApiError('NOT_FOUND', 'Cliente introuvable.');
const invalid = (message: string, field?: string) =>
  new ApiError('VALIDATION_ERROR', message, field ? { field } : undefined, 422);

const customerName = (c: { firstName: string | null; lastName: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(' ') || null;

type AccountRow = typeof s.creditAccounts.$inferSelect;
type RequestRow = typeof s.creditRequests.$inferSelect;

/** Lignes du suivi : clientes qui ont un crédit ou une demande, pour les identifiants donnés (ou toutes). */
async function loadRows(db: Db, now: Date, only?: string[]): Promise<AdminCreditRow[]> {
  const [accounts, pending] = await Promise.all([
    db
      .select()
      .from(s.creditAccounts)
      .where(only ? inArray(s.creditAccounts.customerId, only) : undefined),
    db
      .select()
      .from(s.creditRequests)
      .where(
        and(
          eq(s.creditRequests.status, 'pending'),
          only ? inArray(s.creditRequests.customerId, only) : undefined,
        ),
      ),
  ]);
  const ids = [
    ...new Set([...accounts.map((a) => a.customerId), ...pending.map((r) => r.customerId)]),
  ];
  if (ids.length === 0) return [];
  const [customers, debts] = await Promise.all([
    db
      .select({ c: s.customers, typeLabel: s.customerTypes.label })
      .from(s.customers)
      .leftJoin(s.customerTypes, eq(s.customerTypes.id, s.customers.customerTypeId))
      .where(inArray(s.customers.id, ids)),
    debtsOf(db, ids, true),
  ]);
  const accountOf = new Map<string, AccountRow>(accounts.map((a) => [a.customerId, a]));
  const requestOf = new Map<string, RequestRow>(pending.map((r) => [r.customerId, r]));
  return customers.map(({ c, typeLabel }) => {
    const account = accountOf.get(c.id) ?? null;
    const request = requestOf.get(c.id) ?? null;
    const figures = creditFigures(
      account,
      debts.filter((d) => d.customerId === c.id),
      now,
    );
    const updatedAt = [account?.updatedAt, request?.createdAt]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      customer: {
        id: c.id,
        name: customerName(c),
        phone: c.phone,
        typeLabel: typeLabel ?? 'Particulier',
      },
      status: figures.status,
      limit: figures.limit,
      used: figures.used,
      available: figures.available,
      termDays: account?.termDays ?? 0,
      dueToday: figures.dueToday,
      daysLate: figures.daysLate,
      pendingRequest: request ? toRequest(request) : null,
      updatedAt: (updatedAt ?? c.updatedAt).toISOString(),
    };
  });
}

const matches: Record<Exclude<AdminCreditFilter, 'all'>, (r: AdminCreditRow) => boolean> = {
  requests: (r) => r.pendingRequest !== null,
  active: (r) => r.status === 'active',
  late: (r) => r.status !== 'none' && r.daysLate > 0,
  suspended: (r) => r.status === 'suspended',
};

export async function listAdminCredit(
  db: Db,
  query: AdminCreditListQuery,
  now = new Date(),
): Promise<AdminCreditList> {
  let all = await loadRows(db, now);
  if (query.q) {
    const q = normalize(query.q);
    const digits = query.q.replace(/\D/g, '');
    all = all.filter(
      (r) =>
        normalize(r.customer.name ?? '').includes(q) ||
        (digits.length >= 3 && r.customer.phone.includes(digits)),
    );
  }
  const counts = { all: all.length } as Record<AdminCreditFilter, number>;
  for (const [key, test] of Object.entries(matches))
    counts[key as keyof typeof matches] = all.filter(test).length;

  // Demandes : les plus anciennes d'abord ; retard : les plus en retard d'abord ; sinon les plus récents.
  let filtered = query.filter === 'all' ? all : all.filter(matches[query.filter]);
  filtered = [...filtered].sort((a, b) =>
    query.filter === 'requests'
      ? (a.pendingRequest?.createdAt ?? '').localeCompare(b.pendingRequest?.createdAt ?? '')
      : query.filter === 'late'
        ? b.daysLate - a.daysLate
        : b.updatedAt.localeCompare(a.updatedAt),
  );
  const start = decodeCursor(query.cursor);
  return {
    items: filtered.slice(start, start + PAGE),
    nextCursor: start + PAGE < filtered.length ? encodeCursor(start + PAGE) : null,
    counts,
  };
}

export async function getAdminCredit(
  db: Db,
  role: AdminRole,
  customerId: string,
  now = new Date(),
): Promise<AdminCreditDetail> {
  const [customer] = await db
    .select({ id: s.customers.id })
    .from(s.customers)
    .where(eq(s.customers.id, customerId));
  if (!customer) throw notFound();
  const [rows, account, debts, repayments, requests, pro, admins] = await Promise.all([
    loadRows(db, now, [customerId]),
    db.select().from(s.creditAccounts).where(eq(s.creditAccounts.customerId, customerId)),
    debtsOf(db, [customerId]),
    repaymentsOf(db, customerId, 100),
    db
      .select()
      .from(s.creditRequests)
      .where(eq(s.creditRequests.customerId, customerId))
      .orderBy(desc(s.creditRequests.createdAt)),
    isProValidated(db, customerId),
    db.select({ id: s.adminUsers.id, name: s.adminUsers.name }).from(s.adminUsers),
  ]);
  const names = new Map(admins.map((a) => [a.id, a.name]));
  const base = rows[0] ?? (await bareRow(db, customerId, now));
  const acc = account[0] ?? null;
  return {
    ...base,
    isProValidated: pro,
    grantedBy: acc?.grantedBy ? (names.get(acc.grantedBy) ?? null) : null,
    grantedAt: acc?.grantedAt.toISOString() ?? null,
    suspendedReason: acc?.status === 'suspended' ? acc.suspendedReason : null,
    debts: [
      ...debts.filter((d) => d.status === 'open'),
      ...debts.filter((d) => d.status !== 'open').reverse(),
    ].map((d) => toDebt(d, now)),
    repayments: repayments.map((r) => ({
      ...toRepayment(r),
      recordedBy: r.recordedBy ? (names.get(r.recordedBy) ?? null) : null,
      note: r.note,
    })),
    requests: requests.map(toRequest),
    canManage: CREDIT_MANAGE_ROLES.includes(role),
    canRecordCash: CREDIT_CASH_ROLES.includes(role) && base.used > 0,
  };
}

/** Cliente sans crédit ni demande (fiche ouverte depuis la fiche client pour lui accorder un crédit). */
async function bareRow(db: Db, customerId: string, now: Date): Promise<AdminCreditRow> {
  const [row] = await db
    .select({ c: s.customers, typeLabel: s.customerTypes.label })
    .from(s.customers)
    .leftJoin(s.customerTypes, eq(s.customerTypes.id, s.customers.customerTypeId))
    .where(eq(s.customers.id, customerId));
  if (!row) throw notFound();
  return {
    customer: {
      id: row.c.id,
      name: customerName(row.c),
      phone: row.c.phone,
      typeLabel: row.typeLabel ?? 'Particulier',
    },
    status: 'none',
    limit: 0,
    used: 0,
    available: 0,
    termDays: 0,
    dueToday: 0,
    daysLate: 0,
    pendingRequest: null,
    updatedAt: (row.c.updatedAt ?? now).toISOString(),
  };
}

/** Accorder un crédit (accepte la demande en attente) ou modifier plafond et durée (nouveaux achats). */
export async function grantCredit(
  db: Db,
  ctx: AdminContext,
  customerId: string,
  body: AdminCreditGrantBody,
  ip: string | null,
  now = new Date(),
) {
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    await lockCredit(tx, customerId);
    const [customer] = await tx
      .select({ id: s.customers.id })
      .from(s.customers)
      .where(eq(s.customers.id, customerId));
    if (!customer) throw notFound();
    const [before] = await tx
      .select()
      .from(s.creditAccounts)
      .where(eq(s.creditAccounts.customerId, customerId));
    if (!before && !(await isProValidated(tx, customerId))) {
      throw invalid('Le crédit est réservé aux comptes pros validés : validez d’abord son profil.');
    }
    if (before) {
      await tx
        .update(s.creditAccounts)
        .set({ limit: body.limit, termDays: body.termDays, updatedAt: now })
        .where(eq(s.creditAccounts.customerId, customerId));
    } else {
      await tx.insert(s.creditAccounts).values({
        customerId,
        limit: body.limit,
        termDays: body.termDays,
        grantedBy: ctx.admin.id,
        grantedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    const approved = await tx
      .update(s.creditRequests)
      .set({ status: 'approved', reviewedBy: ctx.admin.id, reviewedAt: now })
      .where(
        and(eq(s.creditRequests.customerId, customerId), eq(s.creditRequests.status, 'pending')),
      )
      .returning({ id: s.creditRequests.id });
    await tx.insert(s.outbox).values({
      eventType: before ? 'credit.updated' : 'credit.granted',
      aggregate: 'credit',
      aggregateId: customerId,
      payload: { limit: body.limit, termDays: body.termDays, by: ctx.admin.id },
    });
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: before ? 'credit.updated' : 'credit.granted',
      entity: 'customer',
      entityId: customerId,
      ip,
      before: before ? { limit: before.limit, termDays: before.termDays } : null,
      after: { ...body, requestId: approved[0]?.id ?? null },
    });
  });
  return getAdminCredit(db, ctx.admin.role, customerId, now);
}

export async function rejectCreditRequest(
  db: Db,
  ctx: AdminContext,
  customerId: string,
  body: AdminCreditRejectBody,
  ip: string | null,
  now = new Date(),
) {
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const [rejected] = await tx
      .update(s.creditRequests)
      .set({ status: 'rejected', reason: body.reason, reviewedBy: ctx.admin.id, reviewedAt: now })
      .where(
        and(eq(s.creditRequests.customerId, customerId), eq(s.creditRequests.status, 'pending')),
      )
      .returning({ id: s.creditRequests.id });
    if (!rejected) throw invalid('Aucune demande en attente pour cette cliente.');
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: 'credit.request_rejected',
      entity: 'customer',
      entityId: customerId,
      ip,
      after: { requestId: rejected.id, reason: body.reason },
    });
  });
  return getAdminCredit(db, ctx.admin.role, customerId, now);
}

/** Suspendre (plus d'achat à crédit ; les remboursements restent possibles) ou rétablir. */
export async function suspendCredit(
  db: Db,
  ctx: AdminContext,
  customerId: string,
  body: AdminCreditSuspendBody,
  ip: string | null,
  now = new Date(),
) {
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const [updated] = await tx
      .update(s.creditAccounts)
      .set({
        status: body.suspended ? 'suspended' : 'active',
        suspendedReason: body.suspended ? (body.reason ?? null) : null,
        updatedAt: now,
      })
      .where(eq(s.creditAccounts.customerId, customerId))
      .returning();
    if (!updated) throw invalid('Cette cliente n’a pas de crédit.');
    await tx.insert(s.outbox).values({
      eventType: body.suspended ? 'credit.suspended' : 'credit.restored',
      aggregate: 'credit',
      aggregateId: customerId,
      payload: { reason: body.reason ?? null, by: ctx.admin.id },
    });
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: body.suspended ? 'credit.suspended' : 'credit.restored',
      entity: 'customer',
      entityId: customerId,
      ip,
      after: { reason: body.reason ?? null },
    });
  });
  return getAdminCredit(db, ctx.admin.role, customerId, now);
}

/** Remboursement reçu en espèces au comptoir : réparti tout de suite sur les dettes, la plus ancienne d'abord. */
export async function recordCreditCash(
  db: Db,
  ctx: AdminContext,
  customerId: string,
  body: AdminCreditCashBody,
  ip: string | null,
  now = new Date(),
) {
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    await lockCredit(tx, customerId);
    const error = repaymentError(body.amount, await outstandingOf(tx, customerId));
    if (error) throw invalid(error, 'amount');
    const [agency] = await tx
      .select()
      .from(s.agencies)
      .where(and(eq(s.agencies.id, body.agencyId), eq(s.agencies.isActive, true)));
    if (!agency) throw invalid('Agence inconnue.', 'agencyId');
    const [r] = await tx
      .insert(s.creditRepayments)
      .values({
        id: newId('rmb'),
        customerId,
        method: 'cash',
        amount: body.amount,
        status: 'succeeded',
        agencyId: agency.id,
        recordedBy: ctx.admin.id,
        note: body.note ?? null,
        settledAt: now,
        createdAt: now,
      })
      .returning();
    await applyRepayment(tx, r!, now);
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: 'credit.cash_recorded',
      entity: 'customer',
      entityId: customerId,
      ip,
      after: {
        repaymentId: r!.id,
        amount: body.amount,
        agencyId: agency.id,
        note: body.note ?? null,
      },
    });
  });
  return getAdminCredit(db, ctx.admin.role, customerId, now);
}
