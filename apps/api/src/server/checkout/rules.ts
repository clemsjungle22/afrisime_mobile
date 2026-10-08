import {
  type CheckoutAgency,
  type CheckoutRules,
  type CheckoutZone,
  DEFAULT_SLOT_CONFIG,
  type IsSlotFull,
  SlotConfig,
} from '@afrisime/shared';
import { and, asc, count, eq, gte, inArray, notInArray, sql } from 'drizzle-orm';
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

/** Plages horaires, jours fermés et capacité des créneaux (app_settings). */
export const SLOTS_KEY = 'checkout.slots';

/** Règles commerciales du checkout, lues dans app_settings (modifiables sans redéploiement, RB-010). */
export async function loadRules(db: Db): Promise<CheckoutRules> {
  const rows = await db
    .select()
    .from(s.appSettings)
    .where(inArray(s.appSettings.key, [...Object.keys(DEFAULTS), SLOTS_KEY]));
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
    slots: slotConfigOf(rows.find((r) => r.key === SLOTS_KEY)?.value),
  };
}

/** Réglage illisible ou absent : créneaux par défaut (le checkout ne doit jamais casser). */
export function slotConfigOf(value: unknown): SlotConfig {
  const parsed = SlotConfig.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_SLOT_CONFIG;
}

/** Commandes qui n'occupent plus de place dans un créneau. */
const RELEASED = ['cancelled', 'refunded'] as const;

/**
 * Créneau complet : nombre de commandes déjà prises sur ce créneau ≥ capacité réglée.
 * Sans capacité réglée, aucun comptage.
 */
export async function slotOccupancy(db: Db, rules: CheckoutRules, now: Date): Promise<IsSlotFull> {
  const capacity = (rules.slots ?? DEFAULT_SLOT_CONFIG).capacity;
  if (capacity.delivery === null && capacity.pickup === null) return () => false;
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const slotId = sql<string>`${s.orders.slot}->>'id'`;
  const rows = await db
    .select({ id: slotId, n: count() })
    .from(s.orders)
    .where(
      and(
        notInArray(s.orders.status, [...RELEASED]),
        gte(sql`(${s.orders.slot}->>'start')::timestamptz`, since),
      ),
    )
    .groupBy(slotId);
  const taken = new Map(rows.map((r) => [r.id, Number(r.n)]));
  return ({ id, kind }) => {
    const max = kind.startsWith('d_') ? capacity.delivery : capacity.pickup;
    return max !== null && (taken.get(id) ?? 0) >= max;
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
