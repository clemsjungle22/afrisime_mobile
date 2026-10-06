import { ApiError } from '@/api/errors';
import {
  ACCESS_TTL_S,
  MAX_ATTEMPTS,
  MOCK_OTP_CODE,
  RATE_LIMITED_PHONE,
  refreshSession,
  requestOtp,
  requireUser,
  resetOtpRequests,
  updateProfile,
  verifyOtp,
} from '../authServer';
import { resetMockDb, SEED_USER } from '../db';

const device = { platform: 'android' as const, model: 'Test', osVersion: '14', appVersion: '1.0.0' };
const NEW_PHONE = '+22891234567';

async function rejection(promise: Promise<unknown> | (() => unknown)): Promise<ApiError> {
  try {
    if (typeof promise === 'function') promise();
    else await promise;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('aurait dû échouer');
}

beforeEach(() => {
  resetMockDb();
  resetOtpRequests();
});

describe('demande de code', () => {
  it('renvoie validité et délai de renvoi', () => {
    expect(requestOtp(NEW_PHONE)).toMatchObject({ expiresIn: 300, resendIn: 30 });
  });

  it('refuse un renvoi trop rapide puis l’accepte après le délai', async () => {
    const t0 = 1_000_000;
    requestOtp(NEW_PHONE, t0);
    const e = await rejection(() => requestOtp(NEW_PHONE, t0 + 10_000));
    expect(e).toMatchObject({ code: 'RATE_LIMITED', status: 429, details: { retryIn: 20 } });
    expect(requestOtp(NEW_PHONE, t0 + 31_000).requestId).toBeTruthy();
  });

  it('numéro de test bloqué', async () => {
    expect(await rejection(() => requestOtp(RATE_LIMITED_PHONE))).toMatchObject({ code: 'RATE_LIMITED' });
  });
});

describe('vérification du code', () => {
  it('code faux : essais restants décomptés, puis blocage', async () => {
    const { requestId } = requestOtp(NEW_PHONE);
    for (let left = MAX_ATTEMPTS - 1; left >= 1; left--) {
      const e = await rejection(verifyOtp({ requestId, code: '000000', device }));
      expect(e).toMatchObject({ code: 'OTP_INVALID', details: { attemptsLeft: left } });
    }
    expect(await rejection(verifyOtp({ requestId, code: '000000', device }))).toMatchObject({
      code: 'OTP_TOO_MANY_ATTEMPTS',
    });
    // Même le bon code est refusé une fois bloqué.
    expect(await rejection(verifyOtp({ requestId, code: MOCK_OTP_CODE, device }))).toMatchObject({
      code: 'OTP_TOO_MANY_ATTEMPTS',
    });
  });

  it('code expiré', async () => {
    const t0 = 2_000_000;
    const { requestId } = requestOtp(NEW_PHONE, t0);
    expect(await rejection(verifyOtp({ requestId, code: MOCK_OTP_CODE, device }, t0 + 301_000))).toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });

  it('nouveau numéro : compte créé, profil incomplet', async () => {
    const { requestId } = requestOtp(NEW_PHONE);
    const r = await verifyOtp({ requestId, code: MOCK_OTP_CODE, device });
    expect(r.isNewUser).toBe(true);
    expect(r.user).toMatchObject({ phone: NEW_PHONE, profileComplete: false });
    expect(r.expiresIn).toBe(ACCESS_TTL_S);
  });

  it('compte existant : connexion directe', async () => {
    const { requestId } = requestOtp(SEED_USER.phone);
    const r = await verifyOtp({ requestId, code: MOCK_OTP_CODE, device });
    expect(r.isNewUser).toBe(false);
    expect(r.user.id).toBe(SEED_USER.id);
  });

  it('un code ne sert qu’une fois', async () => {
    const { requestId } = requestOtp(NEW_PHONE);
    await verifyOtp({ requestId, code: MOCK_OTP_CODE, device });
    expect(await rejection(verifyOtp({ requestId, code: MOCK_OTP_CODE, device }))).toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });
});

describe('session', () => {
  async function login() {
    const { requestId } = requestOtp(SEED_USER.phone);
    return verifyOtp({ requestId, code: MOCK_OTP_CODE, device });
  }

  it('rotation du refresh token : l’ancien est refusé', async () => {
    const first = await login();
    const second = await refreshSession(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(await rejection(refreshSession(first.refreshToken))).toMatchObject({ status: 401 });
  });

  it('jeton d’accès expiré → 401', async () => {
    const { accessToken } = await login();
    await expect(requireUser(accessToken)).resolves.toMatchObject({ id: SEED_USER.id });
    const later = Date.now() + (ACCESS_TTL_S + 1) * 1000;
    expect(await rejection(requireUser(accessToken, later))).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await rejection(requireUser(null))).toMatchObject({ status: 401 });
  });
});

describe('profil', () => {
  it('profil complet ; type professionnel en attente de validation', async () => {
    const { requestId } = requestOtp(NEW_PHONE);
    const { user } = await verifyOtp({ requestId, code: MOCK_OTP_CODE, device });
    const saved = await updateProfile(user, {
      firstName: 'Ama',
      lastName: 'Kodjo',
      customerTypeId: 'revendeur',
      agencyId: 'agc_lome_agoe',
      consents: { marketing: true, termsVersion: '2026-10' },
    });
    expect(saved).toMatchObject({
      profileComplete: true,
      customerTypePending: true,
      segmentLabel: 'Particulier',
      consents: { marketing: true, termsVersion: '2026-10' },
    });
  });

  it('refuse une agence inconnue', async () => {
    expect(await rejection(updateProfile(SEED_USER, { agencyId: 'agc_inconnue' }))).toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
