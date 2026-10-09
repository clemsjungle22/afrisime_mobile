import { cancelMockDebt, createMockDebt, mockCheckoutCredit } from '../credit';
import { loadDb, resetMockDb } from '../db';
import { creditBalance } from '../storeCredit';

beforeEach(() => resetMockDb());

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-05T09:00:00.000Z');

describe('vente à crédit du mode démo', () => {
  it('sans crédit : option absente ; achat refusé', async () => {
    const db = await loadDb();
    expect(mockCheckoutCredit(db, 'u1', T0)).toBeNull();
    expect(() => createMockDebt(db, 'u1', { id: 'o1', orderNumber: 'AFS-1', total: 1000 }, T0)).toThrow();
  });

  it('achat dans le plafond, retard bloquant, annulation : dette effacée et remboursé rendu en avoir', async () => {
    const db = await loadDb();
    db.credit.u1 = { account: { limit: 20_000, termDays: 10, status: 'active' }, request: null, debts: [], repayments: [] };
    createMockDebt(db, 'u1', { id: 'o1', orderNumber: 'AFS-1', total: 10_000 }, T0);
    expect(mockCheckoutCredit(db, 'u1', T0)).toEqual({ available: 10_000, blockedReason: null });
    expect(() => createMockDebt(db, 'u1', { id: 'o2', orderNumber: 'AFS-2', total: 12_000 }, T0)).toThrow(/disponible/);

    // Trois jours sans rembourser : en retard, plus d'achat à crédit.
    expect(mockCheckoutCredit(db, 'u1', T0 + 3 * DAY)?.blockedReason).toMatch(/retard/);

    db.credit.u1!.debts[0]!.paid = 1_000;
    cancelMockDebt(db, 'u1', 'o1', T0 + DAY);
    expect(db.credit.u1!.debts[0]!.status).toBe('cancelled');
    expect(mockCheckoutCredit(db, 'u1', T0 + 3 * DAY)).toEqual({ available: 20_000, blockedReason: null });
    expect(creditBalance(db, 'u1')).toBe(1_000);
  });
});
