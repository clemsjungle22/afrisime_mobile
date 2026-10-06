import type { Address, DeliveryOptions, Slot } from '@afrisime/shared';
import { toQuoteRequest } from '../hooks';
import { resolveSelection, type CheckoutSelection } from '../selection';

const slot = (id: string, available = true): Slot => ({
  id,
  start: '2026-10-07T12:00:00.000Z',
  end: '2026-10-07T16:00:00.000Z',
  available,
  remaining: null,
});

const address = (id: string, isDefault = false): Address => ({
  id,
  label: 'Maison',
  recipientName: 'Kossi',
  phone: '+22890000001',
  district: 'Tokoin',
  city: 'Lomé',
  landmark: 'Pharmacie',
  instructions: null,
  location: null,
  isDefault,
  zoneId: 'zone_1',
  zoneName: 'Zone 1',
});

const options: DeliveryOptions = {
  delivery: {
    available: true,
    unavailableCode: null,
    unavailableReason: null,
    zone: { id: 'zone_1', name: 'Zone 1' },
    fee: 500,
    freeAbove: 50000,
    minOrderAmount: 2000,
    slots: [slot('d_full', false), slot('d_ok')],
  },
  pickup: {
    agencies: [
      { agencyId: 'agc_a', name: 'A', address: '', openingHours: null, slots: [slot('p_a')] },
      { agencyId: 'agc_b', name: 'B', address: '', openingHours: null, slots: [slot('p_b')] },
    ],
  },
  paymentMethods: [
    { id: 'tmoney', label: 'T-Money', description: null, fulfillments: ['delivery', 'pickup'], available: true, unavailableReason: null },
    { id: 'cash_on_delivery', label: 'COD', description: null, fulfillments: ['delivery'], available: false, unavailableReason: 'Zone' },
    { id: 'pay_at_agency', label: 'Agence', description: null, fulfillments: ['pickup'], available: true, unavailableReason: null },
  ],
};

const prefs = (p: Partial<CheckoutSelection> = {}): CheckoutSelection => ({
  fulfillment: 'delivery',
  addressId: null,
  agencyId: null,
  slotId: null,
  paymentMethod: null,
  ...p,
});

describe('resolveSelection', () => {
  it('valeurs par défaut : adresse par défaut, 1er créneau DISPONIBLE, 1er paiement disponible', () => {
    const r = resolveSelection({
      prefs: prefs(),
      addresses: [address('a1'), address('a2', true)],
      options,
      profileAgencyId: null,
    });
    expect(r.selection).toMatchObject({ addressId: 'a2', slotId: 'd_ok', paymentMethod: 'tmoney' });
    expect(r.missing).toBeNull();
  });

  it('remplace une adresse supprimée, un créneau complet et un paiement indisponible', () => {
    const r = resolveSelection({
      prefs: prefs({ addressId: 'supprimee', slotId: 'd_full', paymentMethod: 'cash_on_delivery' }),
      addresses: [address('a1')],
      options,
      profileAgencyId: null,
    });
    expect(r.selection).toMatchObject({ addressId: 'a1', slotId: 'd_ok', paymentMethod: 'tmoney' });
  });

  it('retrait : agence du profil par défaut, paiement compatible', () => {
    const r = resolveSelection({
      prefs: prefs({ fulfillment: 'pickup', paymentMethod: 'pay_at_agency' }),
      addresses: [],
      options,
      profileAgencyId: 'agc_b',
    });
    expect(r.selection).toMatchObject({ agencyId: 'agc_b', slotId: 'p_b', paymentMethod: 'pay_at_agency' });
  });

  it('signale l’étape manquante', () => {
    expect(resolveSelection({ prefs: prefs(), addresses: [], options, profileAgencyId: null }).missing).toBe('address');
    const outOfZone = { ...options, delivery: { ...options.delivery!, available: false, slots: [] } };
    expect(
      resolveSelection({ prefs: prefs(), addresses: [address('a1')], options: outOfZone, profileAgencyId: null }).missing,
    ).toBe('zone');
  });
});

describe('toQuoteRequest', () => {
  const lines = [{ variantId: 'v', quantity: 1, expectedUnitPrice: 100, expectedAvailability: 'available' as const }];

  it('null tant que la sélection est incomplète', () => {
    expect(toQuoteRequest(prefs({ addressId: 'a', slotId: null, paymentMethod: 'tmoney' }), lines)).toBeNull();
    expect(toQuoteRequest(prefs({ addressId: 'a', slotId: 's', paymentMethod: 'tmoney' }), [])).toBeNull();
  });

  it('n’envoie que le lieu du mode choisi', () => {
    expect(
      toQuoteRequest(prefs({ fulfillment: 'pickup', addressId: 'a', agencyId: 'g', slotId: 's', paymentMethod: 'tmoney' }), lines),
    ).toMatchObject({ fulfillment: 'pickup', addressId: null, agencyId: 'g', useCredit: false });
  });
});
