import { type Address, type AddressInput, normalize } from '@afrisime/shared';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';

type AddressRow = typeof s.addresses.$inferSelect;
type Zone = { id: string; name: string };

/** Nombre d'adresses enregistrables par client (garde-fou). */
export const MAX_ADDRESSES = 20;

const notFound = () => new ApiError('NOT_FOUND', 'Adresse introuvable.');

/** Zone de livraison d'une adresse (null = non desservie : autre ville ou quartier inconnu). */
export async function zoneFor(db: Db, district: string, city: string): Promise<Zone | null> {
  const zones = await db.select().from(s.deliveryZones).where(eq(s.deliveryZones.isActive, true)).orderBy(asc(s.deliveryZones.sortOrder));
  const d = normalize(district);
  const c = normalize(city);
  const zone = zones.find((z) => normalize(z.city) === c && z.districts.some((x) => normalize(x) === d));
  return zone ? { id: zone.id, name: zone.name } : null;
}

function toAddress(row: AddressRow, zones: Map<string, string>): Address {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipientName,
    phone: row.phone,
    district: row.district,
    city: row.city,
    landmark: row.landmark,
    instructions: row.instructions,
    location:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude, accuracy: row.accuracy }
        : null,
    isDefault: row.isDefault,
    zoneId: row.zoneId,
    zoneName: row.zoneId ? (zones.get(row.zoneId) ?? null) : null,
  };
}

async function zoneNames(db: Db): Promise<Map<string, string>> {
  const rows = await db.select({ id: s.deliveryZones.id, name: s.deliveryZones.name }).from(s.deliveryZones);
  return new Map(rows.map((z) => [z.id, z.name]));
}

const active = (customerId: string) => and(eq(s.addresses.customerId, customerId), isNull(s.addresses.deletedAt));

export async function listAddresses(db: Db, customerId: string): Promise<Address[]> {
  const [rows, zones] = await Promise.all([
    db.select().from(s.addresses).where(active(customerId)).orderBy(asc(s.addresses.createdAt)),
    zoneNames(db),
  ]);
  return rows.map((r) => toAddress(r, zones));
}

async function fields(db: Db, input: AddressInput) {
  const zone = await zoneFor(db, input.district, input.city);
  return {
    label: input.label,
    recipientName: input.recipientName,
    phone: input.phone,
    district: input.district,
    city: input.city,
    landmark: input.landmark,
    instructions: input.instructions,
    latitude: input.location?.latitude ?? null,
    longitude: input.location?.longitude ?? null,
    accuracy: input.location?.accuracy ?? null,
    zoneId: zone?.id ?? null,
  };
}

/** Une seule adresse par défaut : `preferredId` le devient, sinon on garde l'actuelle, sinon la plus ancienne. */
async function normalizeDefault(db: Db, customerId: string, preferredId: string | null) {
  const rows = await db.select().from(s.addresses).where(active(customerId)).orderBy(asc(s.addresses.createdAt));
  const defaultId = preferredId ?? rows.find((a) => a.isDefault)?.id ?? rows[0]?.id ?? null;
  if (!defaultId) return;
  await db.update(s.addresses).set({ isDefault: false }).where(and(active(customerId), ne(s.addresses.id, defaultId)));
  await db.update(s.addresses).set({ isDefault: true }).where(eq(s.addresses.id, defaultId));
}

async function getOne(db: Db, customerId: string, id: string): Promise<Address> {
  const [row] = await db.select().from(s.addresses).where(and(active(customerId), eq(s.addresses.id, id)));
  if (!row) throw notFound();
  return toAddress(row, await zoneNames(db));
}

export async function createAddress(db: Db, customerId: string, input: AddressInput): Promise<Address> {
  const values = await fields(db, input);
  return db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    const existing = await tx.$count(s.addresses, active(customerId));
    if (existing >= MAX_ADDRESSES) {
      throw new ApiError('VALIDATION_ERROR', `Vous avez atteint la limite de ${MAX_ADDRESSES} adresses.`, undefined, 422);
    }
    const id = newId('adr');
    await tx.insert(s.addresses).values({ id, customerId, ...values, isDefault: false });
    await normalizeDefault(tx, customerId, input.isDefault || existing === 0 ? id : null);
    return getOne(tx, customerId, id);
  });
}

export async function updateAddress(db: Db, customerId: string, id: string, input: AddressInput): Promise<Address> {
  const values = await fields(db, input);
  return db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    // Filtre sur le client : l'adresse d'un autre client répond « introuvable », sans rien révéler.
    const updated = await tx
      .update(s.addresses)
      .set(values)
      .where(and(active(customerId), eq(s.addresses.id, id)))
      .returning({ id: s.addresses.id });
    if (updated.length === 0) throw notFound();
    await normalizeDefault(tx, customerId, input.isDefault ? id : null);
    return getOne(tx, customerId, id);
  });
}

/**
 * Suppression « douce » : l'adresse disparaît pour le client mais reste liée aux commandes passées.
 * Supprimer une adresse déjà supprimée ou inconnue ne fait rien (idempotent).
 */
export async function deleteAddress(db: Db, customerId: string, id: string): Promise<void> {
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    await tx
      .update(s.addresses)
      .set({ deletedAt: new Date(), isDefault: false })
      .where(and(active(customerId), eq(s.addresses.id, id)));
    await normalizeDefault(tx, customerId, null);
  });
}
