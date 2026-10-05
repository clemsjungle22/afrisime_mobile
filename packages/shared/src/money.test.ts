import { describe, expect, it } from 'vitest';
import { formatFCFA, Money } from './money';

const NBSP = ' ';

describe('formatFCFA', () => {
  it.each([
    [0, `0${NBSP}FCFA`],
    [500, `500${NBSP}FCFA`],
    [1000, `1${NBSP}000${NBSP}FCFA`],
    [12500, `12${NBSP}500${NBSP}FCFA`],
    [1250000, `1${NBSP}250${NBSP}000${NBSP}FCFA`],
    [-4750, `-4${NBSP}750${NBSP}FCFA`],
  ])('formate %i', (amount, expected) => {
    expect(formatFCFA(amount)).toBe(expected);
  });

  it('refuse les montants non entiers', () => {
    expect(() => formatFCFA(12.5)).toThrow(RangeError);
    expect(() => formatFCFA(Number.NaN)).toThrow(RangeError);
  });
});

describe('Money', () => {
  it('accepte un entier positif', () => {
    expect(Money.parse(4900)).toBe(4900);
  });

  it('refuse float et négatif', () => {
    expect(Money.safeParse(49.5).success).toBe(false);
    expect(Money.safeParse(-1).success).toBe(false);
  });
});
