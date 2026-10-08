import type { ValidatedCart } from './cart';
import type {
  Address,
  DeliveryOptions,
  Fulfillment,
  PaymentMethodId,
  PaymentMethodOption,
  Quote,
  QuoteRequest,
  Slot,
} from './checkout';
import { formatFCFA } from './money';
import { DEFAULT_SLOT_CONFIG, type SlotConfig } from './slotConfig';

/**
 * Règles du checkout (créneaux, options de livraison, devis), partagées par le serveur et le mode démo.
 * Les données (zones, agences, seuils) sont passées en paramètre : elles viennent de la base côté serveur.
 * Heures en UTC = heure de Lomé (UTC+0 toute l'année).
 */

export type CheckoutRules = {
  /** Livraison offerte à partir de ce sous-total (FCFA). */
  freeAbove: number;
  /** Sous-total minimum pour être livré (FCFA). */
  minOrderAmount: number;
  /** Plafond du paiement à la livraison (FCFA). */
  cashOnDeliveryMax: number;
  /** Préparation minimale avant le début d'un créneau. */
  leadTimeMs: number;
  /** Validité d'un devis. */
  quoteTtlMs: number;
  /** Plages horaires, jours fermés, capacité (défaut : DEFAULT_SLOT_CONFIG). */
  slots?: SlotConfig;
};

export type CheckoutZone = { id: string; name: string; fee: number; cashOnDelivery: boolean };
export type CheckoutAgency = { id: string; name: string; address: string; openingHours: string | null };

/** Créneau complet (capacité atteinte) : décidé par l'appelant. */
export type IsSlotFull = (slot: {
  id: string;
  kind: string;
  dayIndex: number;
  fromHour: number;
}) => boolean;

type Window = { from: number; to: number };
export const DELIVERY_WINDOWS: readonly Window[] = DEFAULT_SLOT_CONFIG.delivery;
export const PICKUP_WINDOWS: readonly Window[] = DEFAULT_SLOT_CONFIG.pickup;

/** Erreur de règle métier (code du contrat, statut HTTP) : chaque côté la traduit dans son type d'erreur. */
export class CheckoutRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CheckoutRuleError';
  }
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/** Créneaux des prochains jours ouverts, sans ceux qui commencent trop tôt. */
export function buildSlots(
  kind: string,
  windows: readonly Window[],
  now: Date,
  leadTimeMs: number,
  isFull: IsSlotFull = () => false,
  calendar: Pick<SlotConfig, 'closedDays' | 'daysAhead'> = DEFAULT_SLOT_CONFIG,
): Slot[] {
  const slots: Slot[] = [];
  const closed = new Set(calendar.closedDays);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let day = 0, found = 0; found < calendar.daysAhead && day < calendar.daysAhead + 7; day++) {
    const date = new Date(start.getTime() + day * 86_400_000);
    if (closed.has(date.getUTCDay())) continue;
    found++;
    for (const w of windows) {
      const from = new Date(date.getTime() + w.from * 3_600_000);
      const to = new Date(date.getTime() + w.to * 3_600_000);
      if (from.getTime() < now.getTime() + leadTimeMs) continue;
      const id = `slot_${kind}_${dayKey(date)}_${w.from}`;
      const full = isFull({ id, kind, dayIndex: day, fromHour: w.from });
      slots.push({
        id,
        start: from.toISOString(),
        end: to.toISOString(),
        available: !full,
        remaining: full ? 0 : null,
      });
    }
  }
  return slots;
}

export const deliverySlots = (zoneId: string, now: Date, rules: CheckoutRules, isFull?: IsSlotFull) => {
  const config = rules.slots ?? DEFAULT_SLOT_CONFIG;
  return buildSlots(`d_${zoneId}`, config.delivery, now, rules.leadTimeMs, isFull, config);
};
export const pickupSlots = (agencyId: string, now: Date, rules: CheckoutRules, isFull?: IsSlotFull) => {
  const config = rules.slots ?? DEFAULT_SLOT_CONFIG;
  return buildSlots(`p_${agencyId}`, config.pickup, now, rules.leadTimeMs, isFull, config);
};

export const PAYMENT_LABELS: Record<PaymentMethodId, string> = {
  mixx: 'Mixx by Yas',
  flooz: 'Moov Money (Flooz)',
  cash_on_delivery: 'Paiement à la livraison',
  pay_at_agency: 'Paiement en agence',
  card: 'Carte bancaire',
};

/** Moyens de paiement payés en ligne (Mobile Money) : la commande attend leur confirmation. */
export const ONLINE_PAYMENT_METHODS: ReadonlySet<PaymentMethodId> = new Set(['mixx', 'flooz']);

export function paymentMethods(zone: CheckoutZone | null, hasAddress: boolean, rules: CheckoutRules): PaymentMethodOption[] {
  const codAllowed = zone?.cashOnDelivery ?? false;
  return [
    {
      id: 'mixx',
      label: PAYMENT_LABELS.mixx,
      description: 'Confirmez le paiement sur votre téléphone.',
      fulfillments: ['delivery', 'pickup'],
      available: true,
      unavailableReason: null,
    },
    {
      id: 'flooz',
      label: PAYMENT_LABELS.flooz,
      description: 'Confirmez le paiement sur votre téléphone.',
      fulfillments: ['delivery', 'pickup'],
      available: true,
      unavailableReason: null,
    },
    {
      id: 'cash_on_delivery',
      label: PAYMENT_LABELS.cash_on_delivery,
      description: `En espèces au livreur, jusqu'à ${formatFCFA(rules.cashOnDeliveryMax)}.`,
      fulfillments: ['delivery'],
      available: codAllowed,
      unavailableReason: codAllowed ? null : hasAddress ? 'Non disponible dans votre zone.' : 'Choisissez une adresse.',
    },
    {
      id: 'pay_at_agency',
      label: PAYMENT_LABELS.pay_at_agency,
      description: 'Réglez au moment du retrait.',
      fulfillments: ['pickup'],
      available: true,
      unavailableReason: null,
    },
    {
      id: 'card',
      label: PAYMENT_LABELS.card,
      description: null,
      fulfillments: ['delivery', 'pickup'],
      available: false,
      unavailableReason: 'Bientôt disponible.',
    },
  ];
}

export type DeliveryContext = {
  address: Address | null;
  /** Zone de l'adresse (null = hors zone ou pas d'adresse). */
  zone: CheckoutZone | null;
  agencies: readonly CheckoutAgency[];
  rules: CheckoutRules;
  now: Date;
  isFull?: IsSlotFull;
};

export function buildDeliveryOptions({ address, zone, agencies, rules, now, isFull }: DeliveryContext): DeliveryOptions {
  return {
    delivery: address
      ? zone
        ? {
            available: true,
            unavailableCode: null,
            unavailableReason: null,
            zone: { id: zone.id, name: zone.name },
            fee: zone.fee,
            freeAbove: rules.freeAbove,
            minOrderAmount: rules.minOrderAmount,
            slots: deliverySlots(zone.id, now, rules, isFull),
          }
        : {
            available: false,
            unavailableCode: 'ZONE_NOT_SERVED',
            unavailableReason: 'Nous ne livrons pas encore ce quartier. Choisissez le retrait en agence.',
            zone: null,
            fee: 0,
            freeAbove: null,
            minOrderAmount: null,
            slots: [],
          }
      : null,
    pickup: {
      agencies: agencies.map((a) => ({
        agencyId: a.id,
        name: a.name,
        address: a.address,
        openingHours: a.openingHours,
        slots: pickupSlots(a.id, now, rules, isFull),
      })),
    },
    paymentMethods: paymentMethods(zone, address !== null, rules),
  };
}

function checkPayment(
  method: PaymentMethodId,
  fulfillment: Fulfillment,
  zone: CheckoutZone | null,
  hasAddress: boolean,
  total: number,
  rules: CheckoutRules,
) {
  const option = paymentMethods(zone, hasAddress, rules).find((m) => m.id === method);
  if (!option || !option.fulfillments.includes(fulfillment) || !option.available) {
    throw new CheckoutRuleError('PAYMENT_METHOD_UNAVAILABLE', option?.unavailableReason ?? 'Moyen de paiement indisponible.', 422);
  }
  if (method === 'cash_on_delivery' && total > rules.cashOnDeliveryMax) {
    throw new CheckoutRuleError(
      'PAYMENT_METHOD_UNAVAILABLE',
      `Paiement à la livraison limité à ${formatFCFA(rules.cashOnDeliveryMax)}.`,
      422,
    );
  }
}

export type QuoteContext = {
  /** Panier revalidé au prix et au stock du moment. */
  validated: ValidatedCart;
  /** Adresse demandée (null si introuvable ou retrait). */
  address: Address | null;
  zone: CheckoutZone | null;
  /** Agence demandée (null si introuvable ou livraison). */
  agency: CheckoutAgency | null;
  rules: CheckoutRules;
  now: Date;
  quoteId: string;
  isFull?: IsSlotFull;
};

/** Devis final : panier revalidé, frais, créneau et moyen de paiement. Le total fait foi. */
export function buildQuote(request: QuoteRequest, ctx: QuoteContext): Quote {
  const { validated, rules, now } = ctx;
  if (validated.changes.length > 0) {
    throw new CheckoutRuleError('CART_CHANGED', 'Votre panier a changé.', 409, { changes: validated.changes });
  }
  if (validated.lines.some((l) => l.status === 'unavailable')) {
    throw new CheckoutRuleError('OUT_OF_STOCK', 'Retirez les articles indisponibles de votre panier.', 409);
  }

  let fee = 0;
  let slots: Slot[];
  let summary: string;
  const address = request.fulfillment === 'delivery' ? ctx.address : null;
  const zone = address ? ctx.zone : null;

  if (request.fulfillment === 'delivery') {
    if (!address) throw new CheckoutRuleError('VALIDATION_ERROR', 'Adresse introuvable.', 422);
    if (!zone) throw new CheckoutRuleError('ZONE_NOT_SERVED', 'Nous ne livrons pas encore ce quartier.', 422);
    if (validated.subtotal < rules.minOrderAmount) {
      throw new CheckoutRuleError(
        'MIN_ORDER_NOT_MET',
        `Livraison à partir de ${formatFCFA(rules.minOrderAmount)} d'achats.`,
        422,
        { minOrderAmount: rules.minOrderAmount },
      );
    }
    fee = validated.subtotal >= rules.freeAbove ? 0 : zone.fee;
    slots = deliverySlots(zone.id, now, rules, ctx.isFull);
    summary = `Livraison · ${address.label} — ${address.district}`;
  } else {
    const agency = ctx.agency;
    if (!agency) throw new CheckoutRuleError('VALIDATION_ERROR', 'Agence introuvable.', 422);
    slots = pickupSlots(agency.id, now, rules, ctx.isFull);
    summary = `Retrait · Agence ${agency.name}`;
  }

  const slot = slots.find((s) => s.id === request.slotId);
  if (!slot || !slot.available) {
    throw new CheckoutRuleError('SLOT_UNAVAILABLE', "Ce créneau n'est plus disponible. Choisissez-en un autre.", 409);
  }

  const total = validated.subtotal + fee - validated.discountTotal;
  checkPayment(request.paymentMethod, request.fulfillment, zone, address !== null, total, rules);

  return {
    quoteId: ctx.quoteId,
    expiresAt: new Date(now.getTime() + rules.quoteTtlMs).toISOString(),
    fulfillment: request.fulfillment,
    addressId: address?.id ?? null,
    agencyId: request.fulfillment === 'pickup' ? (ctx.agency?.id ?? null) : null,
    slot,
    paymentMethod: request.paymentMethod,
    lines: validated.lines,
    subtotal: validated.subtotal,
    deliveryFee: fee,
    discountTotal: validated.discountTotal,
    total,
    currency: 'XOF',
    fulfillmentSummary: summary,
  };
}
