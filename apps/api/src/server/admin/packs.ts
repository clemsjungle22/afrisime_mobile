import {
  type AdminCarnetDetail,
  type AdminCarnetFilter,
  type AdminCarnetList,
  type AdminCarnetListQuery,
  type AdminCarnetRow,
  type AdminCashBody,
  type AdminPack,
  type AdminPackFormat,
  type AdminPackInput,
  type AdminRole,
  type CarnetStatus,
  carnetProgress,
  catalogValue,
  contributionError,
  dailyAmountOf,
  findVariant,
  normalize,
  packItemsView,
} from '@afrisime/shared';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { type CarnetSnapshot, contributionsOf, credit, toContribution } from '../carnets/service';
import { decodeCursor, encodeCursor, getCatalog } from '../catalog/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { removeImage, storeImage } from '../media';
import { type AdminContext, adminAudit } from './auth';
import { CUSTOMER_VIEW_ROLES } from './customers';

/** Créer et modifier les packs : administrateur et catalogue. */
export const PACK_EDIT_ROLES: readonly AdminRole[] = ['admin', 'catalog'];
export const PACK_VIEW_ROLES: readonly AdminRole[] = [
  'admin',
  'catalog',
  'orders',
  'support',
  'readonly',
];
/** Suivi des carnets (données personnelles) : comme les clients. */
export const CARNET_VIEW_ROLES = CUSTOMER_VIEW_ROLES;
/** Encaisser une cotisation en espèces : administrateur et commandes (comptoir). */
export const CASH_ROLES: readonly AdminRole[] = ['admin', 'orders'];

const PAGE = 50;
const PACK_SHAPE = { width: 1000, height: 1000, fit: 'cover' } as const;
const notFound = (what: string) => new ApiError('NOT_FOUND', `${what} introuvable.`);
const invalid = (message: string, field?: string) =>
  new ApiError('VALIDATION_ERROR', message, field ? { field } : undefined, 422);

type PackLine = { variantId: string; quantity: number };

// ─── Packs ───────────────────────────────────────────────────────────────────

export async function listAdminPacks(db: Db): Promise<AdminPack[]> {
  const [rows, counts, catalog] = await Promise.all([
    db.select().from(s.packs).orderBy(asc(s.packs.sortOrder), asc(s.packs.createdAt)),
    db
      .select({ packId: s.carnets.packId, status: s.carnets.status, n: count() })
      .from(s.carnets)
      .groupBy(s.carnets.packId, s.carnets.status),
    getCatalog('retail'),
  ]);
  return rows.map((p) => {
    const mine = counts.filter((c) => c.packId === p.id);
    const items = p.items as PackLine[];
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      imageUrl: p.imageUrl,
      items: packItemsView(items, catalog.products),
      price: p.price,
      durationDays: p.durationDays,
      dailyAmount: dailyAmountOf(p.price, p.durationDays),
      isActive: p.isActive,
      sortOrder: p.sortOrder,
      catalogValue: catalogValue(items, catalog.products),
      activeCarnets: Number(mine.find((c) => c.status === 'active')?.n ?? 0),
      totalCarnets: mine.reduce((n, c) => n + Number(c.n), 0),
    };
  });
}

/**
 * Créer ou modifier un pack. Les carnets déjà ouverts ne changent pas : contenu et prix y sont figés.
 */
export async function savePack(
  db: Db,
  ctx: AdminContext,
  id: string | null,
  body: AdminPackInput,
): Promise<AdminPack[]> {
  const catalog = await getCatalog('retail');
  // Une ligne par format.
  const merged = new Map<string, number>();
  for (const item of body.items) {
    if (!findVariant(catalog.products, item.variantId))
      throw invalid('Un des produits n’existe plus.', 'items');
    merged.set(item.variantId, (merged.get(item.variantId) ?? 0) + item.quantity);
  }
  const items = [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
  const values = { ...body, items, updatedAt: new Date() };
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    if (!id) {
      const packId = newId('pack');
      const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(s.packs);
      await tx.insert(s.packs).values({ id: packId, ...values, sortOrder: Number(n) });
      await adminAudit(tx, {
        actorId: ctx.admin.id,
        action: 'pack.created',
        entity: 'pack',
        entityId: packId,
        after: values,
      });
      return;
    }
    const [before] = await tx.select().from(s.packs).where(eq(s.packs.id, id));
    if (!before) throw notFound('Pack');
    await tx.update(s.packs).set(values).where(eq(s.packs.id, id));
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: 'pack.updated',
      entity: 'pack',
      entityId: id,
      before,
      after: values,
    });
  });
  return listAdminPacks(db);
}

export async function setPackImage(db: Db, ctx: AdminContext, id: string, data: Buffer | null) {
  const [row] = await db.select().from(s.packs).where(eq(s.packs.id, id));
  if (!row) throw notFound('Pack');
  const url = data ? await storeImage('packs', id, data, PACK_SHAPE) : null;
  await db.update(s.packs).set({ imageUrl: url, updatedAt: new Date() }).where(eq(s.packs.id, id));
  await adminAudit(db, {
    actorId: ctx.admin.id,
    action: url ? 'pack.image_set' : 'pack.image_removed',
    entity: 'pack',
    entityId: id,
    before: { imageUrl: row.imageUrl },
    after: { imageUrl: url },
  });
  await removeImage(row.imageUrl);
  return listAdminPacks(db);
}

/** Formats du catalogue proposables dans un pack (« Riz parfumé · Sac 5 kg », prix public du jour). */
export async function listPackFormats(): Promise<AdminPackFormat[]> {
  const catalog = await getCatalog('retail');
  return catalog.products
    .flatMap((p) =>
      p.variants.map((v) => ({
        variantId: v.id,
        label: `${p.name} · ${v.label}`,
        brand: p.brand,
        price: v.price,
      })),
    )
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

// ─── Carnets ─────────────────────────────────────────────────────────────────

type Joined = { carnet: typeof s.carnets.$inferSelect; customer: typeof s.customers.$inferSelect };

const customerName = (c: { firstName: string | null; lastName: string | null }) =>
  [c.firstName, c.lastName].filter(Boolean).join(' ') || null;

function toRow({ carnet: c, customer }: Joined, now: Date): AdminCarnetRow {
  const status = c.status as CarnetStatus;
  const progress = carnetProgress(
    { price: c.price, dailyAmount: c.dailyAmount, paid: c.paid, startedAt: c.startedAt, status },
    now,
  );
  return {
    id: c.id,
    customer: { id: customer.id, name: customerName(customer), phone: customer.phone },
    packName: (c.snapshot as CarnetSnapshot).name,
    price: c.price,
    paid: c.paid,
    remaining: progress.remaining,
    dailyAmount: c.dailyAmount,
    status,
    daysLate: progress.daysLate,
    startedAt: c.startedAt.toISOString(),
    dueAt: c.dueAt.toISOString(),
    completedAt: c.completedAt?.toISOString() ?? null,
  };
}

const matches: Record<Exclude<AdminCarnetFilter, 'all'>, (r: AdminCarnetRow) => boolean> = {
  active: (r) => r.status === 'active',
  late: (r) => r.status === 'active' && r.daysLate > 0,
  completed: (r) => r.status === 'completed',
  delivered: (r) => r.status === 'delivered',
  abandoned: (r) => r.status === 'abandoned',
};

export async function listAdminCarnets(
  db: Db,
  query: AdminCarnetListQuery,
  now = new Date(),
): Promise<AdminCarnetList> {
  const rows = await db
    .select({ carnet: s.carnets, customer: s.customers })
    .from(s.carnets)
    .innerJoin(s.customers, eq(s.customers.id, s.carnets.customerId))
    .orderBy(desc(s.carnets.startedAt));
  let all = rows.map((r) => toRow(r, now));
  if (query.q) {
    const q = normalize(query.q);
    const digits = query.q.replace(/\D/g, '');
    all = all.filter(
      (r) =>
        normalize(`${r.customer.name ?? ''} ${r.packName}`).includes(q) ||
        (digits.length >= 3 && r.customer.phone.includes(digits)),
    );
  }
  const counts = { all: all.length } as Record<AdminCarnetFilter, number>;
  for (const [key, test] of Object.entries(matches))
    counts[key as keyof typeof matches] = all.filter(test).length;

  // En retard : les plus en retard d'abord ; soldés : les plus anciens d'abord (à remettre en priorité).
  let filtered = query.filter === 'all' ? all : all.filter(matches[query.filter]);
  if (query.filter === 'late') filtered = [...filtered].sort((a, b) => b.daysLate - a.daysLate);
  if (query.filter === 'completed')
    filtered = [...filtered].sort((a, b) =>
      (a.completedAt ?? '').localeCompare(b.completedAt ?? ''),
    );

  const start = decodeCursor(query.cursor);
  return {
    items: filtered.slice(start, start + PAGE),
    nextCursor: start + PAGE < filtered.length ? encodeCursor(start + PAGE) : null,
    counts,
  };
}

export async function getAdminCarnet(
  db: Db,
  role: AdminRole,
  id: string,
  now = new Date(),
): Promise<AdminCarnetDetail> {
  const [row] = await db
    .select({ carnet: s.carnets, customer: s.customers })
    .from(s.carnets)
    .innerJoin(s.customers, eq(s.customers.id, s.carnets.customerId))
    .where(eq(s.carnets.id, id));
  if (!row) throw notFound('Carnet');
  const [byCarnet, admins] = await Promise.all([
    contributionsOf(db, [id]),
    db.select({ id: s.adminUsers.id, name: s.adminUsers.name }).from(s.adminUsers),
  ]);
  const names = new Map(admins.map((a) => [a.id, a.name]));
  const base = toRow(row, now);
  return {
    ...base,
    items: (row.carnet.snapshot as CarnetSnapshot).items,
    durationDays: row.carnet.durationDays,
    contributions: (byCarnet.get(id) ?? []).map((c) => ({
      ...toContribution(c, c.agencyName),
      recordedBy: c.recordedBy ? (names.get(c.recordedBy) ?? 'Équipe AfriSime') : null,
      note: c.note,
    })),
    orderId: row.carnet.orderId,
    creditedAmount: row.carnet.creditedAmount,
    canRecordCash: base.status === 'active' && CASH_ROLES.includes(role),
  };
}

/** Cotisation reçue en espèces au comptoir : enregistrée et ajoutée au carnet tout de suite. */
export async function recordCash(
  db: Db,
  ctx: AdminContext,
  id: string,
  body: AdminCashBody,
  ip: string | null,
  now = new Date(),
): Promise<AdminCarnetDetail> {
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const [carnet] = await tx.select().from(s.carnets).where(eq(s.carnets.id, id));
    if (!carnet) throw notFound('Carnet');
    if (carnet.status !== 'active') throw invalid('Ce carnet n’accepte plus de cotisation.');
    const error = contributionError(body.amount, carnet.price - carnet.paid);
    if (error) throw invalid(error, 'amount');
    const [agency] = await tx
      .select()
      .from(s.agencies)
      .where(and(eq(s.agencies.id, body.agencyId), eq(s.agencies.isActive, true)));
    if (!agency) throw invalid('Agence inconnue.', 'agencyId');

    const [c] = await tx
      .insert(s.carnetContributions)
      .values({
        id: newId('cot'),
        carnetId: id,
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
    await credit(tx, c!, now);
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: 'carnet.cash_recorded',
      entity: 'carnet',
      entityId: id,
      ip,
      after: {
        contributionId: c!.id,
        amount: body.amount,
        agencyId: agency.id,
        note: body.note ?? null,
      },
    });
  });
  return getAdminCarnet(db, ctx.admin.role, id, now);
}
