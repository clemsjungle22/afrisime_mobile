import { DELIVERY_RULES } from '@afrisime/fixtures';
import type { Order } from '@afrisime/shared';
import { loadDb, resetMockDb } from '../db';
import { assertMockKycAllows, mockKycStatus, mockSpent30d } from '../kyc';

beforeEach(() => resetMockDb());

const NOW = Date.parse('2026-10-12T10:00:00.000Z');
const order = (total: number, status: Order['status'], daysAgo: number) =>
  ({ id: `o${total}${daysAgo}`, total, status, createdAt: new Date(NOW - daysAgo * 86_400_000).toISOString() }) as Order;

describe('vérification d’identité du mode démo', () => {
  it('achats sur 30 jours au-delà du seuil : refusé sans identité vérifiée', async () => {
    const db = await loadDb();
    const threshold = DELIVERY_RULES.kycThreshold;
    db.orders.u1 = [order(threshold - 1000, 'delivered', 3), order(900_000, 'delivered', 45), order(50_000, 'cancelled', 1)];
    expect(mockSpent30d(db, 'u1', NOW)).toBe(threshold - 1000);
    expect(() => assertMockKycAllows(db, 'u1', 1000, NOW)).not.toThrow();
    expect(() => assertMockKycAllows(db, 'u1', 1001, NOW)).toThrow(/vérifiez votre identité/);

    // Dossier envoyé : validé automatiquement en démo au bout de quelques secondes.
    db.kyc.u1 = { status: 'pending', docType: 'cni', submittedAt: new Date(NOW).toISOString() };
    expect(() => assertMockKycAllows(db, 'u1', 5000, NOW + 1000)).toThrow(/en cours de vérification/);
    expect(mockKycStatus(db, 'u1', NOW + 10_000)).toBe('verified');
    expect(() => assertMockKycAllows(db, 'u1', 5000, NOW + 10_000)).not.toThrow();
  });
});
