import { describe, expect, it } from 'vitest';
import { formatNationalInput, formatPhone, isValidTogoMobile, maskPhone, nationalDigits, toE164 } from './phone';

const NBSP = ' ';

describe('téléphone Togo', () => {
  it('extrait les chiffres nationaux, avec ou sans indicatif', () => {
    expect(nationalDigits('90 12 34 56')).toBe('90123456');
    expect(nationalDigits('+228 90-12-34-56')).toBe('90123456');
    expect(nationalDigits('0022890123456')).toBe('90123456');
    expect(nationalDigits('22890123456')).toBe('90123456');
    expect(nationalDigits('901234567890')).toBe('90123456');
  });

  it('valide les mobiles (8 chiffres, 7x ou 9x)', () => {
    expect(isValidTogoMobile('90123456')).toBe(true);
    expect(isValidTogoMobile('70123456')).toBe(true);
    expect(isValidTogoMobile('22123456')).toBe(false);
    expect(isValidTogoMobile('9012345')).toBe(false);
  });

  it('convertit en E.164', () => {
    expect(toE164('90 12 34 56')).toBe('+22890123456');
    expect(toE164('12 34')).toBeNull();
  });

  it('formate la saisie par paires', () => {
    expect(formatNationalInput('901')).toBe('90 1');
    expect(formatNationalInput('90123456')).toBe('90 12 34 56');
  });

  it('formate et masque pour l’affichage', () => {
    expect(formatPhone('+22890123456')).toBe(`+228${NBSP}90${NBSP}12${NBSP}34${NBSP}56`);
    expect(maskPhone('+22890123456')).toBe(`+228${NBSP}••${NBSP}••${NBSP}34${NBSP}56`);
  });
});
