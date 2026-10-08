import { otpErrorMessage } from '../otpFlow';

describe('otpErrorMessage', () => {
  it('compte suspendu par l’équipe : invite à contacter le service client', () => {
    expect(otpErrorMessage('ACCOUNT_SUSPENDED', undefined, '')).toMatch(/suspendu.*service client/);
  });

  it('code incorrect : nombre d’essais restants', () => {
    expect(otpErrorMessage('OTP_INVALID', { attemptsLeft: 2 }, '')).toBe(
      'Code incorrect. Il vous reste 2 essais.',
    );
  });
});
