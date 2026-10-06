import type { AuthTokens, OtpVerifyResponse } from '@afrisime/shared';
import * as SecureStore from 'expo-secure-store';
import { withAuth } from '@/api/client';
import { ApiError } from '@/api/errors';
import { useCart } from '@/features/cart/store';
import { queryClient } from '@/lib/queryClient';
import { authApi } from '../api';
import { bootstrapSession, refreshAccessToken, signIn, signOut, useSession } from '../session';

jest.mock('../api', () => ({
  authApi: { refresh: jest.fn(), logout: jest.fn(async () => undefined) },
}));

const refreshMock = authApi.refresh as jest.Mock<Promise<AuthTokens>, [string]>;

const user: OtpVerifyResponse['user'] = {
  id: 'usr_1',
  phone: '+22890000001',
  firstName: 'Kossi',
  lastName: 'Mensah',
  email: null,
  customerTypeId: 'particulier',
  segmentLabel: 'Particulier',
  customerTypePending: false,
  agencyId: 'agc_lome_centre',
  consents: { marketing: false, termsVersion: '2026-10' },
  profileComplete: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function verifyResult(accessToken: string, expiresIn = 900): OtpVerifyResponse {
  return { accessToken, refreshToken: 'refresh-1', expiresIn, user, isNewUser: false };
}

const unauthorized = () => new ApiError({ code: 'UNAUTHENTICATED', message: 'Session expirée', status: 401 });

// Le cache global garde ses entrées 24 h (minuteur) : on le vide pour libérer le worker.
afterAll(() => queryClient.clear());

beforeEach(async () => {
  refreshMock.mockReset();
  await SecureStore.deleteItemAsync('afrisime.session');
  await bootstrapSession();
});

describe('session', () => {
  it('démarrage sans session : visiteur', () => {
    expect(useSession.getState().status).toBe('guest');
  });

  it('connexion puis redémarrage : session restaurée depuis le stockage chiffré', async () => {
    await signIn(verifyResult('access-1'));
    expect(useSession.getState()).toMatchObject({ status: 'authenticated', userId: 'usr_1' });
    expect(JSON.parse((await SecureStore.getItemAsync('afrisime.session'))!)).toMatchObject({
      refreshToken: 'refresh-1',
      userId: 'usr_1',
    });

    useSession.setState({ status: 'loading', userId: null, phone: null });
    await bootstrapSession();
    expect(useSession.getState()).toMatchObject({ status: 'authenticated', phone: '+22890000001' });
  });

  it('401 simultanés : UN SEUL renouvellement, puis chaque requête est rejouée', async () => {
    await signIn(verifyResult('access-old'));
    let resolveRefresh: (t: AuthTokens) => void = () => undefined;
    refreshMock.mockImplementation(
      () => new Promise<AuthTokens>((resolve) => (resolveRefresh = resolve)),
    );

    const call = () =>
      withAuth(async (token) => {
        if (token !== 'access-new') throw unauthorized();
        return token;
      });
    const pending = Promise.all([call(), call(), call()]);
    await new Promise((r) => setTimeout(r, 0));
    resolveRefresh({ accessToken: 'access-new', refreshToken: 'refresh-2', expiresIn: 900 });

    await expect(pending).resolves.toEqual(['access-new', 'access-new', 'access-new']);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    // Rotation : le nouveau refresh token est enregistré.
    expect(JSON.parse((await SecureStore.getItemAsync('afrisime.session'))!).refreshToken).toBe('refresh-2');
  });

  it('renouvellement refusé : session expirée, retour en visiteur', async () => {
    await signIn(verifyResult('access-old'));
    refreshMock.mockRejectedValue(unauthorized());
    await expect(
      withAuth(async () => {
        throw unauthorized();
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(useSession.getState().status).toBe('guest');
    expect(await SecureStore.getItemAsync('afrisime.session')).toBeNull();
  });

  it('réseau coupé pendant le renouvellement : la session est conservée', async () => {
    await signIn(verifyResult('access-old'));
    refreshMock.mockRejectedValue(new ApiError({ code: 'NETWORK_ERROR', message: 'hors ligne' }));
    await expect(refreshAccessToken()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(useSession.getState().status).toBe('authenticated');
  });

  it('jeton presque expiré : renouvelé AVANT la requête', async () => {
    await signIn(verifyResult('access-old', 10));
    refreshMock.mockResolvedValue({ accessToken: 'access-fresh', refreshToken: 'refresh-2', expiresIn: 900 });
    await expect(withAuth(async (token) => token)).resolves.toBe('access-fresh');
  });

  it('déconnexion : jetons et panier effacés', async () => {
    await signIn(verifyResult('access-1'));
    useCart.getState().add(
      { slug: 'riz', name: 'Riz', brand: 'S', color: '#b7862b', imageUrl: null },
      { id: 'v', sku: 'v', label: 'Sac', packaging: 'sac', price: 100, compareAtPrice: null, availability: 'available', leadTimeDays: null, minQuantity: 1, isPro: false },
      1,
    );
    await signOut();
    expect(useSession.getState().status).toBe('guest');
    expect(useCart.getState().lines).toHaveLength(0);
    expect(await SecureStore.getItemAsync('afrisime.session')).toBeNull();
  });
});
