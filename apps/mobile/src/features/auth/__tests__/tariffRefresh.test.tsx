import type { UserProfile } from '@afrisime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { authApi } from '../api';
import { useMe, useTariffChangeRefresh } from '../hooks';
import { useSession } from '../session';

jest.mock('../api', () => ({ authApi: { getMe: jest.fn() } }));
const getMe = authApi.getMe as jest.Mock<Promise<UserProfile>, []>;

const profile = (over: Partial<UserProfile>): UserProfile => ({
  id: 'usr_1',
  phone: '+22890112233',
  firstName: 'Afi',
  lastName: 'Mensah',
  email: null,
  customerTypeId: 'revendeur',
  segmentLabel: 'Particulier',
  customerTypePending: true,
  agencyId: 'agc_lome_centre',
  consents: { marketing: false, termsVersion: '2026-01' },
  profileComplete: true,
  createdAt: '2026-10-01T08:00:00.000Z',
  ...over,
});

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  getMe.mockReset();
  useSession.setState({ status: 'authenticated' });
});

describe('profil pro validé par l’équipe', () => {
  it('le profil en attente est revérifié régulièrement', async () => {
    getMe.mockResolvedValue(profile({}));
    const { result } = await renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(result.current.data?.customerTypePending).toBe(true));
    const query = client.getQueryCache().find({ queryKey: ['me'] })!;
    const interval = (query.options as { refetchInterval: (q: unknown) => unknown }).refetchInterval;
    expect(interval(query)).toBe(60_000);
  });

  it('tarif changé : les prix affichés (catalogue, accueil) sont rechargés, une seule fois', async () => {
    getMe.mockResolvedValueOnce(profile({}));
    client.setQueryData(['home'], { prices: 'particulier' });
    await renderHook(() => useTariffChangeRefresh(), { wrapper });
    await waitFor(() => expect(getMe).toHaveBeenCalledTimes(1));
    expect(client.getQueryState(['home'])?.isInvalidated).toBe(false);

    getMe.mockResolvedValueOnce(profile({ segmentLabel: 'Professionnel', customerTypePending: false }));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['me'] });
    });
    await waitFor(() => expect(client.getQueryState(['home'])?.isInvalidated).toBe(true));
  });
});
