import type { Quote } from '@afrisime/shared';
import { loadDb, resetMockDb } from '../db';
import { mockNotificationList } from '../notifications';
import { createOrder, registerQuote, resetOrderServer } from '../orderServer';

const USER = 'usr_kossi';
const T0 = Date.parse('2026-10-07T10:00:00.000Z');
const MIN = 60_000;

function quote(id: string): Quote {
  const q: Quote = {
    quoteId: id,
    expiresAt: new Date(T0 + 15 * MIN).toISOString(),
    fulfillment: 'pickup',
    addressId: null,
    agencyId: 'agc_lome_centre',
    slot: { id: 's', start: '2026-10-07T12:00:00.000Z', end: '2026-10-07T16:00:00.000Z', available: true, remaining: null },
    paymentMethod: 'pay_at_agency',
    lines: [],
    subtotal: 9500,
    deliveryFee: 0,
    discountTotal: 0,
    deliveryBonus: 0,
    storeCreditApplied: 0,
    total: 9500,
    currency: 'XOF',
    fulfillmentSummary: 'Retrait · Agence Lomé Centre',
  };
  registerQuote(USER, q);
  return q;
}

beforeEach(() => {
  resetMockDb();
  resetOrderServer();
});

describe('notifications du mode démo', () => {
  it('une notification par étape franchie (pas pour la création), la plus récente d’abord', async () => {
    const order = await createOrder(USER, { quoteId: quote('q1').quoteId }, 'k1', T0);
    const db = await loadDb();
    expect(mockNotificationList(db, USER, T0 + MIN).items).toHaveLength(0);
    const later = mockNotificationList(db, USER, T0 + 6 * MIN);
    expect(later.unread).toBe(2);
    expect(later.items[0]).toMatchObject({ title: 'Commande prête', link: { type: 'order', orderId: order.id } });
    expect(later.items[1]).toMatchObject({ title: 'Commande en préparation' });
  });
});
