import { describe, expect, it } from 'vitest';
import { carnetProgress, contributionError, dailyAmountOf } from './packs';

const start = new Date('2026-10-05T09:00:00.000Z');
const carnet = (paid: number, status: 'active' | 'completed' = 'active') => ({
  price: 19_500,
  dailyAmount: dailyAmountOf(19_500, 15),
  paid,
  startedAt: start,
  status,
});

describe('cotisation journalière', () => {
  it('prix ÷ jours, arrondi au franc supérieur', () => {
    expect(dailyAmountOf(19_500, 15)).toBe(1300);
    expect(dailyAmountOf(10_000, 3)).toBe(3334);
  });
});

describe('progression d’un carnet', () => {
  it('le jour de la souscription : rien de dû, pas de retard', () => {
    expect(carnetProgress(carnet(0), new Date('2026-10-05T22:00:00.000Z'))).toEqual({
      expectedToDate: 1300,
      daysLate: 0,
      remaining: 19_500,
    });
  });

  it('jours passés non cotisés comptés en retard ; une avance efface le retard', () => {
    const day4 = new Date('2026-10-08T10:00:00.000Z');
    expect(carnetProgress(carnet(1300), day4)).toMatchObject({ expectedToDate: 5200, daysLate: 2 });
    expect(carnetProgress(carnet(3900), day4).daysLate).toBe(0);
    expect(carnetProgress(carnet(3000), day4).daysLate).toBe(1); // retard partiel = 1 jour
  });

  it('après l’échéance, tout le prix est attendu ; soldé : plus de retard', () => {
    const late = carnetProgress(carnet(6500), new Date('2026-11-30T10:00:00.000Z'));
    expect(late).toMatchObject({ expectedToDate: 19_500, daysLate: 10, remaining: 13_000 });
    expect(carnetProgress(carnet(19_500, 'completed'), new Date('2026-11-30T10:00:00.000Z'))).toMatchObject({
      daysLate: 0,
      remaining: 0,
    });
  });
});

describe('montant d’une cotisation', () => {
  it('au moins 100 F, sauf pour solder un reste plus petit ; jamais plus que le reste', () => {
    expect(contributionError(50, 10_000)).toMatch(/minimum/);
    expect(contributionError(80, 80)).toBeNull();
    expect(contributionError(12_000, 10_000)).toMatch(/10000 F/);
    expect(contributionError(1300, 10_000)).toBeNull();
    expect(contributionError(100, 0)).toMatch(/soldé/);
  });
});
