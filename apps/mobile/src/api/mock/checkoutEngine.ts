import {
  type Address,
  type CheckoutZone,
  CheckoutRuleError,
  type DeliveryOptions,
  type IsSlotFull,
  type ProductDetail,
  type Quote,
  type QuoteRequest,
  type Slot,
  buildDeliveryOptions,
  buildQuote as buildQuoteShared,
  buildSlots as buildSlotsShared,
  validateCart,
} from '@afrisime/shared';
import { DELIVERY_RULES, mockOnboardingOptions, mockZones, zoneFor } from '@afrisime/fixtures';
import { type CatalogOverrides, noOverrides } from './scenarios';
import { mockError } from './simulate';

/**
 * Checkout du mode démo : les règles viennent de @afrisime/shared (les mêmes que le serveur),
 * appliquées aux données d'exemple. Seul ajout : le créneau 12h–16h du lendemain est complet (cas de test).
 */

const demoFull: IsSlotFull = ({ dayIndex, fromHour }) => dayIndex === 1 && fromHour === 12;

const zoneOf = (address: Address | null): CheckoutZone | null =>
  (address?.zoneId ? mockZones.find((z) => z.id === address.zoneId) : null) ?? null;

/** Traduit une règle métier non respectée en erreur d'API, comme le ferait le client HTTP. */
function rethrow(error: unknown): never {
  if (error instanceof CheckoutRuleError) throw mockError(error.code, error.message, error.status, error.details);
  throw error;
}

export function buildSlots(kind: string, windows: { from: number; to: number }[], now: Date): Slot[] {
  return buildSlotsShared(kind, windows, now, DELIVERY_RULES.leadTimeMs, demoFull);
}

export function deliveryOptions(address: Address | null, now: Date): DeliveryOptions {
  return buildDeliveryOptions({
    address,
    zone: zoneOf(address),
    agencies: mockOnboardingOptions.agencies,
    rules: DELIVERY_RULES,
    now,
    isFull: demoFull,
  });
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

/** Devis final : revalidation du panier, frais, créneau et moyen de paiement. Le total fait foi. */
export function buildQuote(request: QuoteRequest, ctx: QuoteContext): Quote {
  const validated = validateCart(
    { lines: request.lines },
    { products: ctx.products, stock: ctx.stock, overrides: ctx.overrides ?? noOverrides, now: ctx.now },
  );
  const address = ctx.addresses.find((a) => a.id === request.addressId) ?? null;
  try {
    return buildQuoteShared(request, {
      validated,
      address,
      zone: zoneOf(address),
      agency: mockOnboardingOptions.agencies.find((a) => a.id === request.agencyId) ?? null,
      rules: DELIVERY_RULES,
      now: ctx.now,
      quoteId: ctx.newId(),
      isFull: demoFull,
    });
  } catch (error) {
    rethrow(error);
  }
}
