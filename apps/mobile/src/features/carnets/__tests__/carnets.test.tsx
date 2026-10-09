import type { Carnet } from '@afrisime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { carnetsApi } from '../api';
import { useContribute, useSubscribe } from '../hooks';

jest.mock('../api', () => ({ carnetsApi: { contribute: jest.fn(), subscribe: jest.fn() } }));
const contribute = carnetsApi.contribute as jest.Mock<Promise<Carnet>, [string, unknown, string]>;
const subscribe = carnetsApi.subscribe as jest.Mock<Promise<Carnet>, [string, string]>;

const carnet = { id: 'car_1' } as Carnet;
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  contribute.mockReset();
  subscribe.mockReset();
});

const body = { amount: 1300, method: 'mixx' as const, phone: '+22890112233' };

describe('cotisation : jamais deux débits', () => {
  it('même demande renvoyée après une coupure : même clé ; autre montant : nouvelle clé', async () => {
    contribute.mockRejectedValueOnce(new Error('réseau')).mockResolvedValue(carnet);
    const { result } = await renderHook(() => useContribute('car_1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(body).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync(body);
    });
    expect(contribute.mock.calls[0]![2]).toBe(contribute.mock.calls[1]![2]);

    await act(async () => {
      await result.current.mutateAsync({ ...body, amount: 2600 });
    });
    expect(contribute.mock.calls[2]![2]).not.toBe(contribute.mock.calls[1]![2]);
  });
});

describe('souscription : jamais deux carnets', () => {
  it('nouvel essai après une coupure : même clé ; une fois réussie, la suivante en a une nouvelle', async () => {
    subscribe.mockRejectedValueOnce(new Error('réseau')).mockResolvedValue(carnet);
    const { result } = await renderHook(() => useSubscribe(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('pack_quinzaine').catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync('pack_quinzaine');
    });
    await act(async () => {
      await result.current.mutateAsync('pack_quinzaine');
    });
    const keys = subscribe.mock.calls.map((c) => c[1]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
