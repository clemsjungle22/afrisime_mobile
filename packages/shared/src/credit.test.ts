import { describe, expect, it } from 'vitest';
import { buildDeliveryOptions, paymentMethods } from './checkoutLogic';
import { allocateRepayment, creditDailyAmount, debtProgress, repaymentError } from './credit';

const start = new Date('2026-10-05T09:00:00.000Z');
const debt = (paid: number) => ({
  amount: 30_000,
  dailyAmount: creditDailyAmount(30_000, 30),
  paid,
  startedAt: start,
  status: 'open' as const,
});
const day = (n: number) => new Date(start.getTime() + n * 86_400_000);

describe('vente à crédit', () => {
  it('rien n’est dû le jour de l’achat, puis un versement par jour', () => {
    expect(debtProgress(debt(0), start)).toEqual({ dueToday: 0, daysLate: 0, remaining: 30_000 });
    // Le lendemain : 1 000 F attendus, pas encore en retard.
    expect(debtProgress(debt(0), day(1))).toEqual({
      dueToday: 1_000,
      daysLate: 0,
      remaining: 30_000,
    });
    // Deux jours après sans rien verser : un jour de retard.
    expect(debtProgress(debt(0), day(2))).toMatchObject({ dueToday: 2_000, daysLate: 1 });
    expect(debtProgress(debt(2_000), day(2))).toMatchObject({ dueToday: 0, daysLate: 0 });
    // Bien après l'échéance : tout est dû.
    expect(debtProgress(debt(10_000), day(60))).toMatchObject({ dueToday: 20_000, daysLate: 20 });
    expect(debtProgress({ ...debt(0), status: 'cancelled' }, day(10))).toMatchObject({
      dueToday: 0,
      daysLate: 0,
    });
  });

  it('un remboursement règle d’abord la dette la plus ancienne', () => {
    const debts = [
      { id: 'b', amount: 5_000, paid: 0, startedAt: day(3) },
      { id: 'a', amount: 3_000, paid: 1_000, startedAt: day(0) },
    ];
    expect(allocateRepayment(debts, 4_000)).toEqual([
      { id: 'a', amount: 2_000 },
      { id: 'b', amount: 2_000 },
    ]);
    expect(allocateRepayment(debts, 1_500)).toEqual([{ id: 'a', amount: 1_500 }]);
  });

  it('montant d’un remboursement', () => {
    expect(repaymentError(500, 0)).not.toBeNull();
    expect(repaymentError(50, 10_000)).not.toBeNull();
    expect(repaymentError(50, 50)).toBeNull();
    expect(repaymentError(12_000, 10_000)).not.toBeNull();
    expect(repaymentError(1_000, 10_000)).toBeNull();
  });

  it('l’option « Payer à crédit » n’apparaît que pour une cliente qui a un crédit', () => {
    const r = {
      cashOnDeliveryMax: 50_000,
      freeAbove: 30_000,
      minOrderAmount: 5_000,
      leadTimeMs: 0,
      quoteTtlMs: 1,
    };
    const none = buildDeliveryOptions({
      address: null,
      zone: null,
      agencies: [],
      rules: r,
      now: start,
    });
    expect(none.paymentMethods.some((m) => m.id === 'credit')).toBe(false);
    const open = paymentMethods(null, false, r, { available: 20_000, blockedReason: null }).find(
      (m) => m.id === 'credit',
    );
    expect(open).toMatchObject({ available: true, unavailableReason: null });
    const late = paymentMethods(null, false, r, {
      available: 20_000,
      blockedReason: 'En retard',
    }).find((m) => m.id === 'credit');
    expect(late).toMatchObject({ available: false, unavailableReason: 'En retard' });
  });
});
