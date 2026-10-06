import { EXPIRY_GRACE_MS, FAST_POLL_MS, SLOW_POLL_MS, nextPollDelay } from '../status';

const T0 = 1_000_000;
const pending = (expiresInMs: number) => ({ status: 'pending' as const, expiresAt: new Date(T0 + expiresInMs).toISOString() });

describe('nextPollDelay (suivi du paiement)', () => {
  it('3 s pendant la première minute', () => {
    expect(nextPollDelay(undefined, T0, T0)).toBe(FAST_POLL_MS);
    expect(nextPollDelay(pending(90_000), T0, T0 + 30_000)).toBe(FAST_POLL_MS);
  });

  it('10 s ensuite, jusqu’à l’expiration (+ marge)', () => {
    expect(nextPollDelay(pending(90_000), T0, T0 + 70_000)).toBe(SLOW_POLL_MS);
    expect(nextPollDelay(pending(90_000), T0, T0 + 90_000 + EXPIRY_GRACE_MS - 1)).toBe(SLOW_POLL_MS);
  });

  it('arrêt après l’expiration : « paiement en attente » (jamais de supposition)', () => {
    expect(nextPollDelay(pending(90_000), T0, T0 + 90_000 + EXPIRY_GRACE_MS)).toBe(false);
  });

  it('arrêt dès un statut final', () => {
    for (const status of ['succeeded', 'failed', 'expired'] as const) {
      expect(nextPollDelay({ status, expiresAt: new Date(T0 + 90_000).toISOString() }, T0, T0 + 1000)).toBe(false);
    }
  });
});
