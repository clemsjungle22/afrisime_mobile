import type {
  Address,
  DeliveryOptions,
  Fulfillment,
  PaymentMethodId,
  PaymentMethodOption,
  ProductDetail,
  Quote,
  QuoteRequest,
  Slot,
} from '@afrisime/shared';
import { formatFCFA } from '@afrisime/shared';
import { validateCart } from './cartEngine';
import { mockOnboardingOptions } from './data/onboarding';
import { DELIVERY_RULES, mockZones, zoneFor } from './data/zones';
import { noOverrides, type CatalogOverrides } from './scenarios';
import { mockError } from './simulate';

/**
 * Checkout SIMULÉ (options de livraison, créneaux, devis), comme le ferait le serveur.
 * Heures en UTC = heure de Lomé (UTC+0 toute l'année).
 */

type Window = { from: number; to: number };
const DELIVERY_WINDOWS: Window[] = [
  { from: 8, to: 12 },
  { from: 12, to: 16 },
  { from: 16, to: 20 },
];
const PICKUP_WINDOWS: Window[] = [
  { from: 8, to: 12 },
  { from: 12, to: 16 },
  { from: 16, to: 19 },
];
const DAYS_AHEAD = 3;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Créneaux des prochains jours ouvrés (fermé le dimanche), sans les créneaux trop proches.
 * Le créneau de 12h–16h du lendemain est complet (cas de test).
 */
export function buildSlots(kind: string, windows: Window[], now: Date): Slot[] {
  const slots: Slot[] = [];
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let day = 0, found = 0; found < DAYS_AHEAD && day < DAYS_AHEAD + 2; day++) {
    const date = new Date(start.getTime() + day * 86_400_000);
    if (date.getUTCDay() === 0) continue;
    found++;
    for (const w of windows) {
      const from = new Date(date.getTime() + w.from * 3_600_000);
      const to = new Date(date.getTime() + w.to * 3_600_000);
      if (from.getTime() < now.getTime() + DELIVERY_RULES.leadTimeMs) continue;
      const full = day === 1 && w.from === 12;
      slots.push({
        id: `slot_${kind}_${dayKey(date)}_${w.from}`,
        start: from.toISOString(),
        end: to.toISOString(),
        available: !full,
        remaining: full ? 0 : null,
      });
    }
  }
  return slots;
}

function paymentMethods(address: Address | null): PaymentMethodOption[] {
  const zone = address?.zoneId ? mockZones.find((z) => z.id === address.zoneId) : null;
  const codAllowed = zone?.cashOnDelivery ?? false;
  return [
    {
      id: 'mixx',
      label: 'Mixx by Yas',
      description: 'Confirmez le paiement sur votre téléphone.',
      fulfillments: ['delivery', 'pickup'],
      available: true,
      unavailableReason: null,
    },
    {
      id: 'flooz',
      label: 'Moov Money (Flooz)',
      description: 'Confirmez le paiement sur votre téléphone.',
      fulfillments: ['delivery', 'pickup'],
      available: true,
      unavailableReason: null,
    },
    {
      id: 'cash_on_delivery',
      label: 'Paiement à la livraison',
      description: `En espèces au livreur, jusqu'à ${formatFCFA(DELIVERY_RULES.cashOnDeliveryMax)}.`,
      fulfillments: ['delivery'],
      available: codAllowed,
      unavailableReason: codAllowed ? null : address ? 'Non disponible dans votre zone.' : 'Choisissez une adresse.',
    },
    {
      id: 'pay_at_agency',
      label: 'Paiement en agence',
      description: 'Réglez au moment du retrait.',
      fulfillments: ['pickup'],
      available: true,
      unavailableReason: null,
    },
    {
      id: 'card',
      label: 'Carte bancaire',
      description: null,
      fulfillments: ['delivery', 'pickup'],
      available: false,
      unavailableReason: 'Bientôt disponible.',
    },
  ];
}

export function deliveryOptions(address: Address | null, now: Date): DeliveryOptions {
  const zone = address?.zoneId ? (mockZones.find((z) => z.id === address.zoneId) ?? null) : null;
  return {
    delivery: address
      ? zone
        ? {
            available: true,
            unavailableCode: null,
            unavailableReason: null,
            zone: { id: zone.id, name: zone.name },
            fee: zone.fee,
            freeAbove: DELIVERY_RULES.freeAbove,
            minOrderAmount: DELIVERY_RULES.minOrderAmount,
            slots: buildSlots(`d_${zone.id}`, DELIVERY_WINDOWS, now),
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
      agencies: mockOnboardingOptions.agencies.map((a) => ({
        agencyId: a.id,
        name: a.name,
        address: a.address,
        openingHours: a.openingHours,
        slots: buildSlots(`p_${a.id}`, PICKUP_WINDOWS, now),
      })),
    },
    paymentMethods: paymentMethods(address),
  };
}

/** Attribue la zone d'une adresse (création / modification). */
export function withZone<T extends { district: string; city: string }>(a: T): T & { zoneId: string | null; zoneName: string | null } {
  const zone = zoneFor(a.district, a.city);
  return { ...a, zoneId: zone?.id ?? null, zoneName: zone?.name ?? null };
}

type QuoteContext = {
  products: ProductDetail[];
  stock: ReadonlyMap<string, number>;
  overrides?: CatalogOverrides;
  addresses: Address[];
  now: Date;
  newId: () => string;
};

function checkPayment(method: PaymentMethodId, fulfillment: Fulfillment, address: Address | null, total: number) {
  const option = paymentMethods(address).find((m) => m.id === method);
  if (!option || !option.fulfillments.includes(fulfillment) || !option.available) {
    throw mockError('PAYMENT_METHOD_UNAVAILABLE', option?.unavailableReason ?? 'Moyen de paiement indisponible.', 422);
  }
  if (method === 'cash_on_delivery' && total > DELIVERY_RULES.cashOnDeliveryMax) {
    throw mockError(
      'PAYMENT_METHOD_UNAVAILABLE',
      `Paiement à la livraison limité à ${formatFCFA(DELIVERY_RULES.cashOnDeliveryMax)}.`,
      422,
    );
  }
}

/** Devis final : revalidation du panier, frais, créneau et moyen de paiement. Le total fait foi. */
export function buildQuote(request: QuoteRequest, ctx: QuoteContext): Quote {
  const validated = validateCart(
    { lines: request.lines },
    { products: ctx.products, stock: ctx.stock, overrides: ctx.overrides ?? noOverrides, now: ctx.now },
  );
  if (validated.changes.length > 0) {
    throw mockError('CART_CHANGED', 'Votre panier a changé.', 409, { changes: validated.changes });
  }
  if (validated.lines.some((l) => l.status === 'unavailable')) {
    throw mockError('OUT_OF_STOCK', 'Retirez les articles indisponibles de votre panier.', 409);
  }

  let address: Address | null = null;
  let fee = 0;
  let slots: Slot[];
  let summary: string;

  if (request.fulfillment === 'delivery') {
    address = ctx.addresses.find((a) => a.id === request.addressId) ?? null;
    if (!address) throw mockError('VALIDATION_ERROR', 'Adresse introuvable.', 422);
    const zone = address.zoneId ? mockZones.find((z) => z.id === address!.zoneId) : undefined;
    if (!zone) throw mockError('ZONE_NOT_SERVED', 'Nous ne livrons pas encore ce quartier.', 422);
    if (validated.subtotal < DELIVERY_RULES.minOrderAmount) {
      throw mockError(
        'MIN_ORDER_NOT_MET',
        `Livraison à partir de ${formatFCFA(DELIVERY_RULES.minOrderAmount)} d'achats.`,
        422,
        { minOrderAmount: DELIVERY_RULES.minOrderAmount },
      );
    }
    fee = validated.subtotal >= DELIVERY_RULES.freeAbove ? 0 : zone.fee;
    slots = buildSlots(`d_${zone.id}`, DELIVERY_WINDOWS, ctx.now);
    summary = `Livraison · ${address.label} — ${address.district}`;
  } else {
    const agency = mockOnboardingOptions.agencies.find((a) => a.id === request.agencyId);
    if (!agency) throw mockError('VALIDATION_ERROR', 'Agence introuvable.', 422);
    slots = buildSlots(`p_${agency.id}`, PICKUP_WINDOWS, ctx.now);
    summary = `Retrait · Agence ${agency.name}`;
  }

  const slot = slots.find((s) => s.id === request.slotId);
  if (!slot || !slot.available) {
    throw mockError('SLOT_UNAVAILABLE', 'Ce créneau n’est plus disponible. Choisissez-en un autre.', 409);
  }

  const total = validated.subtotal + fee - validated.discountTotal;
  checkPayment(request.paymentMethod, request.fulfillment, address, total);

  return {
    quoteId: ctx.newId(),
    expiresAt: new Date(ctx.now.getTime() + DELIVERY_RULES.quoteTtlMs).toISOString(),
    fulfillment: request.fulfillment,
    addressId: request.fulfillment === 'delivery' ? (address?.id ?? null) : null,
    agencyId: request.fulfillment === 'pickup' ? request.agencyId : null,
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
