import type { Order } from '@afrisime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { ApiError } from '@/api/errors';
import { useCart } from '@/features/cart/store';
import { ordersApi } from '../api';
import { usePlaceOrder } from '../hooks';

jest.mock('../api', () => ({ ordersApi: { createOrder: jest.fn() } }));
const createOrder = ordersApi.createOrder as jest.Mock<Promise<Order>, [string, string]>;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const order = { id: 'ord_1', status: 'pending_payment', payable: true } as Order;

beforeEach(() => {
  createOrder.mockReset();
  useCart.getState().clear();
  useCart.getState().add(
    { slug: 'riz', name: 'Riz', brand: 'S', color: '#b7862b', imageUrl: null },
    { id: 'v', sku: 'v', label: 'Sac', packaging: 'sac', price: 100, compareAtPrice: null, availability: 'available', leadTimeDays: null, minQuantity: 1, isPro: false },
    1,
  );
});

describe('usePlaceOrder', () => {
  it('double tap : une seule requête', async () => {
    let resolve: (o: Order) => void = () => undefined;
    createOrder.mockImplementation(() => new Promise<Order>((r) => (resolve = r)));
    const { result } = await renderHook(() => usePlaceOrder(), { wrapper });

    let first: Promise<Order> | null = null;
    let second: Promise<Order> | null = null;
    await act(async () => {
      first = result.current.place('qte_A');
      second = result.current.place('qte_A');
    });
    expect(second).toBeNull();
    expect(createOrder).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(order);
      await first;
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('nouvelle tentative après coupure : MÊME clé d’idempotence, panier conservé', async () => {
    createOrder.mockRejectedValueOnce(new ApiError({ code: 'NETWORK_ERROR', message: 'hors ligne' }));
    createOrder.mockResolvedValueOnce(order);
    const { result } = await renderHook(() => usePlaceOrder(), { wrapper });

    await act(async () => {
      await result.current.place('qte_B')!.catch(() => undefined);
    });
    expect(useCart.getState().lines).toHaveLength(1);

    await act(async () => {
      await result.current.place('qte_B');
    });
    const [, key1] = createOrder.mock.calls[0]!;
    const [, key2] = createOrder.mock.calls[1]!;
    expect(key1).toMatch(/^[0-9a-f-]{36}$/);
    expect(key2).toBe(key1);
    // Panier vidé seulement une fois la commande créée par le serveur.
    expect(useCart.getState().lines).toHaveLength(0);
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('un autre devis = une autre clé', async () => {
    createOrder.mockResolvedValue(order);
    const { result } = await renderHook(() => usePlaceOrder(), { wrapper });
    await act(async () => {
      await result.current.place('qte_C');
    });
    await act(async () => {
      await result.current.place('qte_D');
    });
    expect(createOrder.mock.calls[0]![1]).not.toBe(createOrder.mock.calls[1]![1]);
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });
});
