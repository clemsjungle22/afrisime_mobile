import {
  type AdminBlockBody,
  type AdminCustomerAction,
  type AdminCustomerDetail,
  type AdminCustomerFilter,
  type AdminCustomerList,
  type AdminCustomerListQuery,
  type AdminCustomerRow,
  type AdminPricingBody,
  type AdminReviewProBody,
  type AdminRole,
  type CustomerStatus,
  type PriceSegment,
} from '@afrisime/shared';
import { type SQL, and, asc, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { decodeCursor, encodeCursor } from '../catalog/service';
import { storeCreditBalance } from '../customers/storeCredit';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { type NewNotification, notify } from '../notifications/service';
import { type AdminContext, adminAudit } from './auth';

const PAGE = 50;

/** Données personnelles : pas le rôle Catalogue. */
export const CUSTOMER_VIEW_ROLES: readonly AdminRole[] = ['admin', 'support', 'orders', 'readonly'];
/** Valider un profil pro, changer un tarif. */
export const CUSTOMER_REVIEW_ROLES: readonly AdminRole[] = ['admin', 'support'];
/** Bloquer ou débloquer un compte. */
export const CUSTOMER_BLOCK_ROLES: readonly AdminRole[] = ['admin'];

/** Commandes qui comptent dans le « total dépensé ». */
const SPENT_STATUSES = sql`('delivered', 'completed')`;

const HISTORY_LABELS: Record<string, string> = {
  'customer.type_changed': 'Profil changé par le client dans l’app',
  'customer.pro_approved': 'Profil pro validé',
  'customer.pro_rejected': 'Profil pro refusé',
  'customer.pricing_changed': 'Profil ou tarif changé',
  'customer.blocked': 'Compte bloqué',
  'customer.unblocked': 'Compte débloqué',
};

type CustomerRow = typeof s.customers.$inferSelect;

const customerName = (c: { firstName: string | null; lastName: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(' ') || null;

const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);

const segmentOf = (v: string): PriceSegment => (v === 'pro' ? 'pro' : 'retail');
const statusOf = (v: string): CustomerStatus => (v === 'active' ? 'active' : 'blocked');

const FILTERS: Record<Exclude<AdminCustomerFilter, 'all'>, SQL> = {
  pending_pro: eq(s.customers.customerTypePending, true),
  pro: eq(s.customers.segment, 'pro'),
  retail: eq(s.customers.segment, 'retail'),
  blocked: sql`${s.customers.status} <> 'active'`,
};

/** Recherche : prénom, nom ou téléphone (même partiel, avec ou sans espaces). */
function searchCondition(q: string): SQL | undefined {
  const digits = q.replace(/\D/g, '');
  const parts: (SQL | undefined)[] = [
    ilike(
      sql`coalesce(${s.customers.firstName}, '') || ' ' || coalesce(${s.customers.lastName}, '')`,
      `%${q}%`,
    ),
  ];
  if (digits.length >= 3) parts.push(ilike(s.customers.phone, `%${digits}%`));
  return or(...parts);
}

/** Commandes par client : nombre, total dépensé, dernière commande. */
function orderStats(db: Db) {
  return db
    .select({
      customerId: s.orders.customerId,
      orderCount: count().as('order_count'),
      spent:
        sql<number>`coalesce(sum(case when ${s.orders.status} in ${SPENT_STATUSES} then ${s.orders.total} else 0 end), 0)`.as(
          'spent',
        ),
      spentCount: sql<number>`count(*) filter (where ${s.orders.status} in ${SPENT_STATUSES})`.as(
        'spent_count',
      ),
      lastOrderAt: sql<Date | string | null>`max(${s.orders.createdAt})`.as('last_order_at'),
    })
    .from(s.orders)
    .groupBy(s.orders.customerId)
    .as('stats');
}

function baseSelect(db: Db) {
  const stats = orderStats(db);
  return db
    .select({
      customer: s.customers,
      typeLabel: s.customerTypes.label,
      agencyName: s.agencies.name,
      orderCount: stats.orderCount,
      spent: stats.spent,
      spentCount: stats.spentCount,
      lastOrderAt: stats.lastOrderAt,
    })
    .from(s.customers)
    .leftJoin(s.customerTypes, eq(s.customerTypes.id, s.customers.customerTypeId))
    .leftJoin(s.agencies, eq(s.agencies.id, s.customers.agencyId))
    .leftJoin(stats, eq(stats.customerId, s.customers.id));
}

type Joined = {
  customer: CustomerRow;
  typeLabel: string | null;
  agencyName: string | null;
  orderCount: number | string | null;
  spent: number | string | null;
  spentCount: number | string | null;
  lastOrderAt: Date | string | null;
};

function toRow(r: Joined): AdminCustomerRow {
  const c = r.customer;
  return {
    id: c.id,
    name: customerName(c),
    phone: c.phone,
    email: c.email,
    customerType: c.customerTypeId
      ? { id: c.customerTypeId, label: r.typeLabel ?? c.customerTypeId }
      : null,
    typePending: c.customerTypePending,
    segment: segmentOf(c.segment),
    agencyName: r.agencyName,
    status: statusOf(c.status),
    orderCount: Number(r.orderCount ?? 0),
    totalSpent: Number(r.spent ?? 0),
    lastOrderAt: iso(r.lastOrderAt),
    createdAt: c.createdAt.toISOString(),
  };
}

// ─── Liste ───────────────────────────────────────────────────────────────────

export async function listAdminCustomers(
  db: Db,
  query: AdminCustomerListQuery,
): Promise<AdminCustomerList> {
  const search = query.q ? searchCondition(query.q) : undefined;
  const filter = query.filter === 'all' ? undefined : FILTERS[query.filter];
  const start = decodeCursor(query.cursor);

  const [rows, ...counted] = await Promise.all([
    baseSelect(db)
      .where(and(search, filter))
      // Pros à valider : les plus anciennes demandes d'abord ; sinon les derniers inscrits.
      .orderBy(
        query.filter === 'pending_pro' ? asc(s.customers.updatedAt) : desc(s.customers.createdAt),
        asc(s.customers.id),
      )
      .limit(PAGE + 1)
      .offset(start),
    db.select({ n: count() }).from(s.customers).where(search),
    ...(Object.values(FILTERS) as SQL[]).map((f) =>
      db.select({ n: count() }).from(s.customers).where(and(search, f)),
    ),
  ]);

  const keys = Object.keys(FILTERS) as Exclude<AdminCustomerFilter, 'all'>[];
  const counts = { all: counted[0]?.[0]?.n ?? 0 } as Record<AdminCustomerFilter, number>;
  keys.forEach((k, i) => (counts[k] = counted[i + 1]?.[0]?.n ?? 0));

  return {
    items: rows.slice(0, PAGE).map(toRow),
    nextCursor: rows.length > PAGE ? encodeCursor(start + PAGE) : null,
    counts,
  };
}

// ─── Fiche ───────────────────────────────────────────────────────────────────

function allowedActions(c: CustomerRow, role: AdminRole): AdminCustomerAction[] {
  const actions: AdminCustomerAction[] = [];
  const active = c.status === 'active';
  if (CUSTOMER_REVIEW_ROLES.includes(role) && active) {
    if (c.customerTypePending) actions.push('review_pro');
    actions.push('change_pricing');
  }
  if (CUSTOMER_BLOCK_ROLES.includes(role)) actions.push(active ? 'block' : 'unblock');
  return actions;
}

export async function getAdminCustomer(
  db: Db,
  role: AdminRole,
  id: string,
): Promise<AdminCustomerDetail> {
  const [row] = await baseSelect(db).where(eq(s.customers.id, id));
  if (!row) throw new ApiError('NOT_FOUND', 'Client introuvable.');
  const c = row.customer;

  const [addresses, orders, history, types, [seen]] = await Promise.all([
    db
      .select({ address: s.addresses, zoneName: s.deliveryZones.name })
      .from(s.addresses)
      .leftJoin(s.deliveryZones, eq(s.deliveryZones.id, s.addresses.zoneId))
      .where(and(eq(s.addresses.customerId, id), isNull(s.addresses.deletedAt)))
      .orderBy(desc(s.addresses.isDefault), asc(s.addresses.createdAt)),
    db
      .select()
      .from(s.orders)
      .where(eq(s.orders.customerId, id))
      .orderBy(desc(s.orders.createdAt))
      .limit(50),
    db
      .select({ entry: s.auditLog, actorName: s.adminUsers.name })
      .from(s.auditLog)
      .leftJoin(
        s.adminUsers,
        and(eq(s.auditLog.actorType, 'admin'), eq(s.adminUsers.id, s.auditLog.actorId)),
      )
      .where(and(eq(s.auditLog.entity, 'customer'), eq(s.auditLog.entityId, id)))
      .orderBy(desc(s.auditLog.at), desc(s.auditLog.id))
      .limit(50),
    db.select().from(s.customerTypes).orderBy(asc(s.customerTypes.sortOrder)),
    db
      .select({ at: sql<Date | string | null>`max(${s.sessions.lastUsedAt})` })
      .from(s.sessions)
      .where(eq(s.sessions.customerId, id)),
  ]);

  const base = toRow(row);
  const spentCount = Number(row.spentCount ?? 0);
  return {
    ...base,
    marketingConsent: c.marketingConsent,
    storeCreditBalance: await storeCreditBalance(db, id),
    lastSeenAt: iso(seen?.at),
    averageBasket: spentCount > 0 ? Math.round(base.totalSpent / spentCount) : 0,
    addresses: addresses.map(({ address: a, zoneName }) => ({
      id: a.id,
      label: a.label,
      recipientName: a.recipientName,
      phone: a.phone,
      district: a.district,
      city: a.city,
      landmark: a.landmark,
      instructions: a.instructions,
      zoneName,
      isDefault: a.isDefault,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      fulfillment: o.fulfillment,
      total: o.total,
    })),
    history: history.map(({ entry, actorName }) => ({
      at: entry.at.toISOString(),
      label: HISTORY_LABELS[entry.action] ?? entry.action,
      actorName: entry.actorType === 'admin' ? (actorName ?? 'Équipe AfriSime') : null,
      reason: (entry.after as { reason?: string } | null)?.reason ?? null,
    })),
    customerTypes: types.map((t) => ({ id: t.id, label: t.label, segment: segmentOf(t.segment) })),
    allowedActions: allowedActions(c, role),
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function loadCustomer(db: Db, id: string): Promise<CustomerRow> {
  const [c] = await db.select().from(s.customers).where(eq(s.customers.id, id));
  if (!c) throw new ApiError('NOT_FOUND', 'Client introuvable.');
  return c;
}

const snapshot = (c: CustomerRow) => ({
  customerTypeId: c.customerTypeId,
  pending: c.customerTypePending,
  segment: c.segment,
  status: c.status,
});

/** Applique un changement au compte, avec l'historique ; renvoie la fiche à jour. */
async function apply(
  db: Db,
  ctx: AdminContext,
  c: CustomerRow,
  action: string,
  changes: Partial<typeof s.customers.$inferInsert>,
  reason: string | null,
  ip: string | null,
  now: Date,
  notification?: NewNotification,
): Promise<AdminCustomerDetail> {
  await db.transaction(async (tx) => {
    if (notification) await notify(tx as unknown as Db, c.id, notification, now);
    const [updated] = await tx
      .update(s.customers)
      .set({ ...changes, updatedAt: now })
      .where(eq(s.customers.id, c.id))
      .returning();
    // Bloqué : déconnecté tout de suite, sur tous ses appareils.
    if (changes.status === 'blocked')
      await tx
        .update(s.sessions)
        .set({ revokedAt: now })
        .where(and(eq(s.sessions.customerId, c.id), isNull(s.sessions.revokedAt)));
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action,
      entity: 'customer',
      entityId: c.id,
      ip,
      before: snapshot(c),
      after: { ...snapshot(updated!), reason },
    });
  });
  return getAdminCustomer(db, ctx.admin.role, c.id);
}

function requireActive(c: CustomerRow) {
  if (c.status !== 'active')
    throw new ApiError(
      'VALIDATION_ERROR',
      'Ce compte est bloqué : débloquez-le d’abord.',
      undefined,
      422,
    );
}

/** Valider (tarif du profil déclaré) ou refuser (retour au profil particulier) une demande pro. */
export async function reviewPro(
  db: Db,
  ctx: AdminContext,
  id: string,
  body: AdminReviewProBody,
  ip: string | null,
  now = new Date(),
): Promise<AdminCustomerDetail> {
  const c = await loadCustomer(db, id);
  requireActive(c);
  if (!c.customerTypePending || !c.customerTypeId)
    throw new ApiError(
      'VALIDATION_ERROR',
      'Aucune demande de profil pro en attente pour ce client.',
      undefined,
      422,
    );
  const types = await db.select().from(s.customerTypes).orderBy(asc(s.customerTypes.sortOrder));
  if (body.decision === 'approve') {
    const declared = types.find((t) => t.id === c.customerTypeId);
    return apply(
      db,
      ctx,
      c,
      'customer.pro_approved',
      { customerTypePending: false, segment: declared?.segment ?? 'pro' },
      body.reason || null,
      ip,
      now,
      {
        kind: 'profile',
        title: 'Profil pro validé',
        body: `Votre profil « ${declared?.label ?? 'professionnel'} » est validé : vos tarifs pros s’appliquent dès maintenant.`,
        link: { type: 'account' },
      },
    );
  }
  // Refus : profil sans validation (particulier), tarif normal. Le client pourra refaire une demande.
  const fallback =
    types.find((t) => !t.requiresReview && t.isActive) ?? types.find((t) => !t.requiresReview);
  return apply(
    db,
    ctx,
    c,
    'customer.pro_rejected',
    {
      customerTypePending: false,
      customerTypeId: fallback?.id ?? c.customerTypeId,
      segment: fallback?.segment ?? 'retail',
    },
    body.reason ?? null,
    ip,
    now,
    {
      kind: 'profile',
      title: 'Profil pro non validé',
      body: body.reason
        ? `Votre demande de profil pro n’a pas été acceptée : ${body.reason}`
        : 'Votre demande de profil pro n’a pas été acceptée. Contactez votre agence pour en savoir plus.',
      link: { type: 'account' },
    },
  );
}

/** Changer le profil et le tarif à la main (motif obligatoire). */
export async function changePricing(
  db: Db,
  ctx: AdminContext,
  id: string,
  body: AdminPricingBody,
  ip: string | null,
  now = new Date(),
): Promise<AdminCustomerDetail> {
  const c = await loadCustomer(db, id);
  requireActive(c);
  const [type] = await db
    .select()
    .from(s.customerTypes)
    .where(eq(s.customerTypes.id, body.customerTypeId));
  if (!type)
    throw new ApiError('VALIDATION_ERROR', 'Profil inconnu.', { field: 'customerTypeId' }, 422);
  return apply(
    db,
    ctx,
    c,
    'customer.pricing_changed',
    { customerTypeId: type.id, segment: body.segment, customerTypePending: false },
    body.reason,
    ip,
    now,
  );
}

export async function setBlocked(
  db: Db,
  ctx: AdminContext,
  id: string,
  blocked: boolean,
  body: AdminBlockBody,
  ip: string | null,
  now = new Date(),
): Promise<AdminCustomerDetail> {
  const c = await loadCustomer(db, id);
  if ((c.status === 'active') !== blocked)
    throw new ApiError(
      'VALIDATION_ERROR',
      blocked ? 'Ce compte est déjà bloqué.' : 'Ce compte n’est pas bloqué.',
      undefined,
      422,
    );
  return apply(
    db,
    ctx,
    c,
    blocked ? 'customer.blocked' : 'customer.unblocked',
    { status: blocked ? 'blocked' : 'active' },
    body.reason,
    ip,
    now,
  );
}
