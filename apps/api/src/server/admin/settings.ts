import {
  type AdminAgency,
  type AdminAgencyInput,
  type AdminCheckoutRules,
  type AdminCustomerType,
  type AdminCustomerTypeInput,
  type AdminDeliverySettings,
  type AdminRole,
  type AdminZoneInput,
  type SlotConfig,
  normalize,
} from '@afrisime/shared';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { invalidateCatalog } from '../catalog/service';
import { SLOTS_KEY, loadRules } from '../checkout/rules';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { type AdminContext, adminAudit } from './auth';

/** Paramètres : administrateur seulement (lecture comprise). */
export const SETTINGS_ROLES: readonly AdminRole[] = ['admin'];

const notFound = (what: string) => new ApiError('NOT_FOUND', `${what} introuvable.`);
const invalid = (message: string, field?: string) =>
  new ApiError('VALIDATION_ERROR', message, field ? { field } : undefined, 422);

const audit = (
  tx: Db,
  ctx: AdminContext,
  action: string,
  entity: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
) => adminAudit(tx, { actorId: ctx.admin.id, action, entity, entityId, before, after });

/** Écriture + audit dans une transaction ; l'app relit les données à jour (catalogue compris). */
async function write<T>(db: Db, run: (tx: Db) => Promise<T>): Promise<T> {
  const result = await db.transaction((txn) => run(txn as unknown as Db));
  invalidateCatalog();
  return result;
}

/** Monter / descendre un élément : ordre normalisé (0, 1, 2…) puis échange des deux voisins. */
async function move(
  tx: Db,
  table: PgTable & { id: AnyPgColumn; sortOrder: AnyPgColumn },
  id: string,
  direction: 'up' | 'down',
  what: string,
) {
  const rows = (await tx
    .select({ id: table.id })
    .from(table)
    .orderBy(asc(table.sortOrder), asc(table.id))) as { id: string }[];
  const index = rows.findIndex((r) => r.id === id);
  if (index < 0) throw notFound(what);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (!rows[target]) return false;
  const order = rows.map((r) => r.id);
  [order[index], order[target]] = [order[target]!, id];
  for (const [i, rowId] of order.entries())
    await tx.update(table).set({ sortOrder: i }).where(eq(table.id, rowId));
  return true;
}

const nextOrder = async (tx: Db, table: PgTable & { sortOrder: AnyPgColumn }) =>
  ((await tx.select({ n: count() }).from(table))[0]?.n ?? 0) as number;

// ─── Livraison : zones et règles ─────────────────────────────────────────────

const RULE_KEYS = {
  freeAbove: 'delivery.free_above',
  minOrder: 'delivery.min_order',
  cashOnDeliveryMax: 'payment.cod_max',
  leadTimeMinutes: 'checkout.lead_time_min',
} as const satisfies Record<keyof AdminCheckoutRules, string>;

const RULE_DESCRIPTIONS: Record<keyof AdminCheckoutRules, string> = {
  freeAbove: 'Livraison offerte à partir de ce sous-total (FCFA)',
  minOrder: 'Sous-total minimum pour être livré (FCFA)',
  cashOnDeliveryMax: 'Plafond du paiement à la livraison (FCFA)',
  leadTimeMinutes: 'Délai minimum avant le début d’un créneau (minutes)',
};

export async function getDeliverySettings(db: Db): Promise<AdminDeliverySettings> {
  const [zones, counts, rules] = await Promise.all([
    db.select().from(s.deliveryZones).orderBy(asc(s.deliveryZones.sortOrder)),
    db
      .select({ zoneId: s.addresses.zoneId, n: count() })
      .from(s.addresses)
      .where(isNull(s.addresses.deletedAt))
      .groupBy(s.addresses.zoneId),
    loadRules(db),
  ]);
  const byZone = new Map(counts.map((c) => [c.zoneId, Number(c.n)]));
  return {
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      city: z.city,
      fee: z.fee,
      cashOnDelivery: z.cashOnDelivery,
      districts: z.districts,
      isActive: z.isActive,
      sortOrder: z.sortOrder,
      addressCount: byZone.get(z.id) ?? 0,
    })),
    rules: {
      freeAbove: rules.freeAbove,
      minOrder: rules.minOrderAmount,
      cashOnDeliveryMax: rules.cashOnDeliveryMax,
      leadTimeMinutes: Math.round(rules.leadTimeMs / 60_000),
    },
  };
}

/** Un quartier ne peut appartenir qu'à une seule zone active de la même ville. */
async function checkDistricts(tx: Db, body: AdminZoneInput, zoneId: string | null) {
  // Quartiers en double dans la saisie : gardés une fois.
  const seen = new Map<string, string>();
  for (const d of body.districts) if (!seen.has(normalize(d))) seen.set(normalize(d), d);
  if (!body.isActive) return [...seen.values()];
  const others = await tx
    .select()
    .from(s.deliveryZones)
    .where(
      and(eq(s.deliveryZones.isActive, true), zoneId ? ne(s.deliveryZones.id, zoneId) : undefined),
    );
  for (const z of others) {
    if (normalize(z.city) !== normalize(body.city)) continue;
    const clash = z.districts.find((d) => seen.has(normalize(d)));
    if (clash)
      throw invalid(`« ${clash} » est déjà couvert par la zone « ${z.name} ».`, 'districts');
  }
  return [...seen.values()];
}

export async function saveZone(
  db: Db,
  ctx: AdminContext,
  id: string | null,
  body: AdminZoneInput,
): Promise<AdminDeliverySettings> {
  await write(db, async (tx) => {
    const districts = await checkDistricts(tx, body, id);
    const values = { ...body, districts };
    if (!id) {
      const zoneId = newId('zon');
      await tx
        .insert(s.deliveryZones)
        .values({ id: zoneId, ...values, sortOrder: await nextOrder(tx, s.deliveryZones) });
      await audit(tx, ctx, 'zone.created', 'zone', zoneId, null, values);
      return;
    }
    const [before] = await tx.select().from(s.deliveryZones).where(eq(s.deliveryZones.id, id));
    if (!before) throw notFound('Zone');
    await tx.update(s.deliveryZones).set(values).where(eq(s.deliveryZones.id, id));
    await audit(tx, ctx, 'zone.updated', 'zone', id, before, values);
  });
  return getDeliverySettings(db);
}

export async function moveZone(db: Db, ctx: AdminContext, id: string, direction: 'up' | 'down') {
  await write(db, async (tx) => {
    if (await move(tx, s.deliveryZones, id, direction, 'Zone'))
      await audit(tx, ctx, 'zone.moved', 'zone', id, null, { direction });
  });
  return getDeliverySettings(db);
}

export async function saveCheckoutRules(
  db: Db,
  ctx: AdminContext,
  body: AdminCheckoutRules,
): Promise<AdminDeliverySettings> {
  const before = (await getDeliverySettings(db)).rules;
  await write(db, async (tx) => {
    const now = new Date();
    for (const key of Object.keys(RULE_KEYS) as (keyof AdminCheckoutRules)[]) {
      await tx
        .insert(s.appSettings)
        .values({ key: RULE_KEYS[key], value: body[key], description: RULE_DESCRIPTIONS[key] })
        .onConflictDoUpdate({
          target: s.appSettings.key,
          set: { value: body[key], updatedAt: now },
        });
    }
    await audit(tx, ctx, 'settings.checkout_rules_updated', 'settings', 'checkout', before, body);
  });
  return getDeliverySettings(db);
}

// ─── Créneaux ────────────────────────────────────────────────────────────────

export async function getSlotSettings(db: Db): Promise<SlotConfig> {
  return (await loadRules(db)).slots!;
}

export async function saveSlotSettings(
  db: Db,
  ctx: AdminContext,
  body: SlotConfig,
): Promise<SlotConfig> {
  const before = await getSlotSettings(db);
  await write(db, async (tx) => {
    await tx
      .insert(s.appSettings)
      .values({
        key: SLOTS_KEY,
        value: body,
        description: 'Créneaux : plages horaires, jours fermés, nombre de jours, capacité',
      })
      .onConflictDoUpdate({
        target: s.appSettings.key,
        set: { value: body, updatedAt: new Date() },
      });
    await audit(tx, ctx, 'settings.slots_updated', 'settings', SLOTS_KEY, before, body);
  });
  return getSlotSettings(db);
}

// ─── Agences ─────────────────────────────────────────────────────────────────

export async function listAgencies(db: Db): Promise<AdminAgency[]> {
  const [rows, counts] = await Promise.all([
    db.select().from(s.agencies).orderBy(asc(s.agencies.sortOrder), asc(s.agencies.name)),
    db
      .select({ agencyId: s.customers.agencyId, n: count() })
      .from(s.customers)
      .groupBy(s.customers.agencyId),
  ]);
  const byAgency = new Map(counts.map((c) => [c.agencyId, Number(c.n)]));
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    city: a.city,
    address: a.address,
    phone: a.phone,
    openingHours: a.openingHours,
    isDefault: a.isDefault,
    isActive: a.isActive,
    sortOrder: a.sortOrder,
    customerCount: byAgency.get(a.id) ?? 0,
  }));
}

export async function saveAgency(
  db: Db,
  ctx: AdminContext,
  id: string | null,
  body: AdminAgencyInput,
): Promise<AdminAgency[]> {
  await write(db, async (tx) => {
    if (!id) {
      const agencyId = newId('agc');
      await tx
        .insert(s.agencies)
        .values({ id: agencyId, ...body, sortOrder: await nextOrder(tx, s.agencies) });
      await audit(tx, ctx, 'agency.created', 'agency', agencyId, null, body);
      return;
    }
    const [before] = await tx.select().from(s.agencies).where(eq(s.agencies.id, id));
    if (!before) throw notFound('Agence');
    if (before.isDefault && !body.isActive)
      throw invalid(
        'L’agence par défaut ne peut pas être désactivée : choisissez d’abord une autre agence par défaut.',
        'isActive',
      );
    await tx.update(s.agencies).set(body).where(eq(s.agencies.id, id));
    await audit(tx, ctx, 'agency.updated', 'agency', id, before, body);
  });
  return listAgencies(db);
}

export async function setDefaultAgency(db: Db, ctx: AdminContext, id: string) {
  await write(db, async (tx) => {
    const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, id));
    if (!agency) throw notFound('Agence');
    if (!agency.isActive) throw invalid('Activez d’abord cette agence.');
    await tx.update(s.agencies).set({ isDefault: false }).where(ne(s.agencies.id, id));
    await tx.update(s.agencies).set({ isDefault: true }).where(eq(s.agencies.id, id));
    await audit(tx, ctx, 'agency.set_default', 'agency', id);
  });
  return listAgencies(db);
}

export async function moveAgency(db: Db, ctx: AdminContext, id: string, direction: 'up' | 'down') {
  await write(db, async (tx) => {
    if (await move(tx, s.agencies, id, direction, 'Agence'))
      await audit(tx, ctx, 'agency.moved', 'agency', id, null, { direction });
  });
  return listAgencies(db);
}

// ─── Profils clients ─────────────────────────────────────────────────────────

export async function listCustomerTypes(db: Db): Promise<AdminCustomerType[]> {
  const [rows, counts] = await Promise.all([
    db.select().from(s.customerTypes).orderBy(asc(s.customerTypes.sortOrder)),
    db
      .select({ typeId: s.customers.customerTypeId, n: count() })
      .from(s.customers)
      .groupBy(s.customers.customerTypeId),
  ]);
  const byType = new Map(counts.map((c) => [c.typeId, Number(c.n)]));
  return rows.map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description,
    requiresReview: t.requiresReview,
    segment: t.segment === 'pro' ? 'pro' : 'retail',
    isActive: t.isActive,
    sortOrder: t.sortOrder,
    customerCount: byType.get(t.id) ?? 0,
  }));
}

/** Identifiant lisible : « Boutique de quartier » → « boutique-de-quartier » (suffixe si déjà pris). */
async function typeId(tx: Db, label: string) {
  const base = normalize(label).replace(/\s+/g, '-').slice(0, 40) || 'profil';
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const [taken] = await tx
      .select({ id: s.customerTypes.id })
      .from(s.customerTypes)
      .where(eq(s.customerTypes.id, candidate));
    if (!taken) return candidate;
  }
  return newId('ctp');
}

export async function saveCustomerType(
  db: Db,
  ctx: AdminContext,
  id: string | null,
  body: AdminCustomerTypeInput,
): Promise<AdminCustomerType[]> {
  await write(db, async (tx) => {
    if (!id) {
      const newTypeId = await typeId(tx, body.label);
      await tx
        .insert(s.customerTypes)
        .values({ id: newTypeId, ...body, sortOrder: await nextOrder(tx, s.customerTypes) });
      await audit(tx, ctx, 'customer_type.created', 'customer_type', newTypeId, null, body);
      return;
    }
    const [before] = await tx.select().from(s.customerTypes).where(eq(s.customerTypes.id, id));
    if (!before) throw notFound('Profil');
    await tx.update(s.customerTypes).set(body).where(eq(s.customerTypes.id, id));
    // Il faut toujours un profil ouvert à tous, sans validation (inscription et refus d'un pro).
    const [open] = await tx
      .select({ n: count() })
      .from(s.customerTypes)
      .where(and(eq(s.customerTypes.isActive, true), eq(s.customerTypes.requiresReview, false)));
    if (!open?.n)
      throw invalid(
        'Gardez au moins un profil actif sans validation (ex. « Particulier ») : c’est celui des nouveaux clients et des demandes pro refusées.',
      );
    await audit(tx, ctx, 'customer_type.updated', 'customer_type', id, before, body);
  });
  return listCustomerTypes(db);
}

export async function moveCustomerType(
  db: Db,
  ctx: AdminContext,
  id: string,
  direction: 'up' | 'down',
) {
  await write(db, async (tx) => {
    if (await move(tx, s.customerTypes, id, direction, 'Profil'))
      await audit(tx, ctx, 'customer_type.moved', 'customer_type', id, null, { direction });
  });
  return listCustomerTypes(db);
}
