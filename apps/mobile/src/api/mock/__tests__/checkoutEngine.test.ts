import { Quote as QuoteSchema, type Address, type CartValidateLine, type QuoteRequest } from '@afrisime/shared';
import { ApiError } from '@/api/errors';
import { buildQuote, buildSlots, deliveryOptions, withZone } from '../checkoutEngine';
import { DELIVERY_RULES, mockProducts, mockStock } from '@afrisime/fixtures';
import { SEED_ADDRESS } from '../db';

// Mardi 7 octobre 2026, 9h30 à Lomé (UTC+0).
const NOW = new Date('2026-10-07T09:30:00.000Z');
const RIZ_5KG = 'var_riz-parfume-savana_0'; // 4 750
const RIZ_50KG = 'var_riz-parfume-savana_2'; // 43 500
const SAVON = 'var_savon-maison-claire_0'; // 350

const line = (variantId: string, quantity: number, price: number): CartValidateLine => ({
  variantId,
  quantity,
  expectedUnitPrice: price,
  expectedAvailability: 'available',
});

const ZONE3: Address = withZone({ ...SEED_ADDRESS, id: 'adr_z3', district: 'Baguida' });
const TSEVIE: Address = withZone({ ...SEED_ADDRESS, id: 'adr_out', district: 'Centre', city: 'Tsévié' });
const addresses = [SEED_ADDRESS, ZONE3, TSEVIE];

function firstSlot(kind: 'delivery' | 'pickup', address: Address | null = SEED_ADDRESS) {
  const o = deliveryOptions(address, NOW);
  const slots = kind === 'delivery' ? o.delivery!.slots : o.pickup.agencies[0]!.slots;
  return slots.find((s) => s.available)!;
}

function quote(partial: Partial<QuoteRequest>) {
  const request: QuoteRequest = {
    fulfillment: 'delivery',
    addressId: SEED_ADDRESS.id,
    agencyId: null,
    slotId: firstSlot('delivery').id,
    paymentMethod: 'mixx',
    useCredit: false,
    lines: [line(RIZ_5KG, 2, 4750)],
    ...partial,
  };
  return buildQuote(request, { products: mockProducts, stock: mockStock, addresses, now: NOW, newId: () => 'qte_1' });
}

function error(run: () => unknown): ApiError {
  try {
    run();
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('aurait dû échouer');
}

describe('créneaux', () => {
  const slots = buildSlots('d', [{ from: 8, to: 12 }, { from: 12, to: 16 }, { from: 16, to: 20 }], NOW);

  it('exclut les créneaux trop proches (préparation 1 h)', () => {
    // 9h30 : 8h–12h exclu, 12h–16h du jour proposé.
    expect(slots[0]?.start).toBe('2026-10-07T12:00:00.000Z');
  });

  it('3 jours ouvrés, fermé le dimanche', () => {
    const days = new Set(slots.map((s) => s.start.slice(0, 10)));
    expect([...days]).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
    const fromFriday = buildSlots('d', [{ from: 8, to: 12 }], new Date('2026-10-09T05:00:00.000Z'));
    expect(fromFriday.map((s) => s.start.slice(0, 10))).toEqual(['2026-10-09', '2026-10-10', '2026-10-12']);
  });

  it('le créneau de 12h–16h du lendemain est complet', () => {
    expect(slots.find((s) => s.start === '2026-10-08T12:00:00.000Z')).toMatchObject({ available: false, remaining: 0 });
  });
});

describe('options de livraison', () => {
  it('zone et frais selon le quartier', () => {
    expect(deliveryOptions(SEED_ADDRESS, NOW).delivery).toMatchObject({ available: true, fee: 500, zone: { id: 'zone_1' } });
    expect(deliveryOptions(ZONE3, NOW).delivery).toMatchObject({ fee: 1500 });
  });

  it('quartier hors zone : livraison impossible, retrait toujours proposé', () => {
    const o = deliveryOptions(TSEVIE, NOW);
    expect(o.delivery).toMatchObject({ available: false, unavailableCode: 'ZONE_NOT_SERVED' });
    expect(o.pickup.agencies.length).toBeGreaterThan(0);
  });

  it('paiement à la livraison seulement dans les zones autorisées', () => {
    const cod = (a: Address) => deliveryOptions(a, NOW).paymentMethods.find((m) => m.id === 'cash_on_delivery');
    expect(cod(SEED_ADDRESS)?.available).toBe(true);
    expect(cod(ZONE3)?.available).toBe(false);
  });
});

describe('devis', () => {
  it('total = sous-total + frais, conforme au contrat, entier', () => {
    const q = QuoteSchema.parse(quote({}));
    expect(q).toMatchObject({ subtotal: 9500, deliveryFee: 500, total: 10000, quoteId: 'qte_1' });
    expect(Date.parse(q.expiresAt) - NOW.getTime()).toBe(DELIVERY_RULES.quoteTtlMs);
  });

  it('livraison offerte au-delà du seuil', () => {
    expect(quote({ lines: [line(RIZ_50KG, 2, 43500)] })).toMatchObject({ subtotal: 87000, deliveryFee: 0, total: 87000 });
  });

  it('minimum de commande pour la livraison, pas pour le retrait', () => {
    expect(error(() => quote({ lines: [line(SAVON, 1, 350)] }))).toMatchObject({ code: 'MIN_ORDER_NOT_MET' });
    const pickup = quote({
      fulfillment: 'pickup',
      addressId: null,
      agencyId: 'agc_lome_centre',
      slotId: firstSlot('pickup').id,
      paymentMethod: 'pay_at_agency',
      lines: [line(SAVON, 1, 350)],
    });
    expect(pickup).toMatchObject({ deliveryFee: 0, total: 350, fulfillmentSummary: 'Retrait · Agence Lomé Centre' });
  });

  it('zone non desservie', () => {
    expect(error(() => quote({ addressId: TSEVIE.id }))).toMatchObject({ code: 'ZONE_NOT_SERVED' });
  });

  it('créneau complet ou inconnu', () => {
    expect(error(() => quote({ slotId: 'slot_d_zone_1_20261008_12' }))).toMatchObject({ code: 'SLOT_UNAVAILABLE' });
    expect(error(() => quote({ slotId: 'slot_inconnu' }))).toMatchObject({ code: 'SLOT_UNAVAILABLE' });
  });

  it('moyens de paiement : incompatibles ou au-delà du plafond refusés', () => {
    expect(error(() => quote({ paymentMethod: 'pay_at_agency' }))).toMatchObject({ code: 'PAYMENT_METHOD_UNAVAILABLE' });
    // Zone 3 : créneaux propres à la zone, paiement à la livraison non autorisé.
    expect(
      error(() => quote({ addressId: ZONE3.id, slotId: firstSlot('delivery', ZONE3).id, paymentMethod: 'cash_on_delivery' })),
    ).toMatchObject({
      code: 'PAYMENT_METHOD_UNAVAILABLE',
    });
    expect(
      error(() => quote({ paymentMethod: 'cash_on_delivery', lines: [line(RIZ_50KG, 3, 43500)] })),
    ).toMatchObject({ code: 'PAYMENT_METHOD_UNAVAILABLE' });
    expect(quote({ paymentMethod: 'cash_on_delivery' }).total).toBe(10000);
  });

  it('prix changé depuis l’affichage → CART_CHANGED avec le détail', () => {
    const e = error(() => quote({ lines: [line(RIZ_5KG, 2, 4900)] }));
    expect(e).toMatchObject({ code: 'CART_CHANGED', status: 409 });
    expect(e.details).toMatchObject({ changes: [{ type: 'price_changed', oldPrice: 4900, newPrice: 4750 }] });
  });
});
