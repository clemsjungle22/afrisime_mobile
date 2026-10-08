import type { CheckoutAgency, CheckoutRules, CheckoutZone } from '@afrisime/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';

/** Valeurs par défaut si un paramètre manque en base (mêmes valeurs que les données d'exemple). */
const DEFAULTS = {
  'delivery.free_above': 50_000,
  'delivery.min_order': 2_000,
  'payment.cod_max': 100_000,
  'checkout.lead_time_min': 60,
  'checkout.quote_ttl_min': 15,
} as const;

/** Règles commerciales du checkout, lues dans app_settings (modifiables sans redéploiement, RB-010). */
export async function loadRules(db: Db): Promise<CheckoutRules> {
  const rows = await db
    .select()
    .from(s.appSettings)
    .where(inArray(s.appSettings.key, Object.keys(DEFAULTS)));
  const value = (key: keyof typeof DEFAULTS) => {
    const v = rows.find((r) => r.key === key)?.value;
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : DEFAULTS[key];
  };
  return {
    freeAbove: value('delivery.free_above'),
    minOrderAmount: value('delivery.min_order'),
    cashOnDeliveryMax: value('payment.cod_max'),
    leadTimeMs: value('checkout.lead_time_min') * 60_000,
    quoteTtlMs: value('checkout.quote_ttl_min') * 60_000,
  };
}

export async function loadAgencies(db: Db): Promise<(CheckoutAgency & { isDefault: boolean })[]> {
  const rows = await db.select().from(s.agencies).where(eq(s.agencies.isActive, true)).orderBy(asc(s.agencies.sortOrder));
  return rows.map(({ id, name, address, openingHours, isDefault }) => ({ id, name, address, openingHours, isDefault }));
}

export async function loadZone(db: Db, zoneId: string | null): Promise<CheckoutZone | null> {
  if (!zoneId) return null;
  const [z] = await db.select().from(s.deliveryZones).where(eq(s.deliveryZones.id, zoneId));
  return z && z.isActive ? { id: z.id, name: z.name, fee: z.fee, cashOnDelivery: z.cashOnDelivery } : null;
}
