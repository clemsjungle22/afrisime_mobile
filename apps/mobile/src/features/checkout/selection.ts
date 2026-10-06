import type { Address, DeliveryOptions, Fulfillment, PaymentMethodId, PaymentMethodOption, Slot } from '@afrisime/shared';

export type CheckoutSelection = {
  fulfillment: Fulfillment;
  addressId: string | null;
  agencyId: string | null;
  slotId: string | null;
  paymentMethod: PaymentMethodId | null;
};

/** Ce qui manque encore pour obtenir un devis (dans l'ordre de l'écran). */
export type MissingStep = 'address' | 'zone' | 'agency' | 'slot' | 'payment' | null;

type Inputs = {
  prefs: CheckoutSelection;
  addresses: Address[];
  options: DeliveryOptions | undefined;
  /** Agence de référence du client (profil), utilisée par défaut pour le retrait. */
  profileAgencyId: string | null;
};

const firstAvailable = (slots: Slot[]) => slots.find((s) => s.available) ?? null;

export function methodsFor(options: DeliveryOptions | undefined, fulfillment: Fulfillment): PaymentMethodOption[] {
  return (options?.paymentMethods ?? []).filter((m) => m.fulfillments.includes(fulfillment));
}

/**
 * Sélection effective à partir des choix mémorisés : une adresse supprimée, un créneau
 * devenu complet ou un moyen de paiement incompatible sont remplacés par une valeur valide.
 */
export function resolveSelection({ prefs, addresses, options, profileAgencyId }: Inputs): {
  selection: CheckoutSelection;
  slots: Slot[];
  missing: MissingStep;
} {
  const { fulfillment } = prefs;

  const addressId =
    addresses.find((a) => a.id === prefs.addressId)?.id ??
    addresses.find((a) => a.isDefault)?.id ??
    addresses[0]?.id ??
    null;

  const agencies = options?.pickup.agencies ?? [];
  const agencyId =
    agencies.find((a) => a.agencyId === prefs.agencyId)?.agencyId ??
    agencies.find((a) => a.agencyId === profileAgencyId)?.agencyId ??
    agencies[0]?.agencyId ??
    null;

  const slots =
    fulfillment === 'delivery'
      ? (options?.delivery?.slots ?? [])
      : (agencies.find((a) => a.agencyId === agencyId)?.slots ?? []);
  const slotId = slots.find((s) => s.id === prefs.slotId && s.available)?.id ?? firstAvailable(slots)?.id ?? null;

  const methods = methodsFor(options, fulfillment).filter((m) => m.available);
  const paymentMethod = methods.find((m) => m.id === prefs.paymentMethod)?.id ?? methods[0]?.id ?? null;

  const selection: CheckoutSelection = { fulfillment, addressId, agencyId, slotId, paymentMethod };

  let missing: MissingStep = null;
  if (fulfillment === 'delivery' && !addressId) missing = 'address';
  else if (fulfillment === 'delivery' && options?.delivery && !options.delivery.available) missing = 'zone';
  else if (fulfillment === 'pickup' && !agencyId) missing = 'agency';
  else if (!slotId) missing = 'slot';
  else if (!paymentMethod) missing = 'payment';

  return { selection, slots, missing };
}
