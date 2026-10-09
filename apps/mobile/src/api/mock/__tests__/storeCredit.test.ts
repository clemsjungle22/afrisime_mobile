import { loadDb, resetMockDb } from '../db';
import { addCredit, creditBalance } from '../storeCredit';

beforeEach(() => resetMockDb());

describe('avoir du mode démo', () => {
  it('crédit, débit, remboursement ; un même motif n’est jamais compté deux fois', async () => {
    const db = await loadDb();
    addCredit(db, 'u1', { amount: 2600, reason: 'carnet_abandoned', carnetId: 'car_1', at: 1 });
    addCredit(db, 'u1', { amount: 2600, reason: 'carnet_abandoned', carnetId: 'car_1', at: 2 });
    expect(creditBalance(db, 'u1')).toBe(2600);

    addCredit(db, 'u1', { amount: -2000, reason: 'order', orderId: 'ord_1', at: 3 });
    expect(creditBalance(db, 'u1')).toBe(600);
    addCredit(db, 'u1', { amount: 2000, reason: 'order_cancelled', orderId: 'ord_1', at: 4 });
    addCredit(db, 'u1', { amount: 2000, reason: 'order_cancelled', orderId: 'ord_1', at: 5 });
    expect(creditBalance(db, 'u1')).toBe(2600);
    expect(creditBalance(db, 'u2')).toBe(0);
  });
});
