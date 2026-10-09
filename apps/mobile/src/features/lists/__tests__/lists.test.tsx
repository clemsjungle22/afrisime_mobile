import { mockProducts, mockStock } from '@afrisime/fixtures';
import {
  type FavoriteList,
  type ProductSummary,
  type ShoppingList,
  addToListLines,
  resolveFavorites,
  resolveList,
  toSummary,
} from '@afrisime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useCart } from '@/features/cart/store';
import { listsApi } from '../api';
import { listsKeys, useListToCart, useToggleFavorite } from '../hooks';

jest.mock('../api', () => ({
  listsApi: { addFavorite: jest.fn(), removeFavorite: jest.fn(), getList: jest.fn() },
}));
const addFavorite = listsApi.addFavorite as jest.Mock<Promise<FavoriteList>, [string]>;
const getList = listsApi.getList as jest.Mock<Promise<ShoppingList>, [string]>;

const RIZ = mockProducts.find((p) => p.slug === 'riz-parfume-savana')!;
const CUBES = mockProducts.find((p) => p.slug === 'cubes-assaisonnement')!;
const catalog = { products: mockProducts, stock: mockStock };

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  addFavorite.mockReset();
  getList.mockReset();
  useCart.getState().clear();
});

describe('logique commune (serveur et mode démo)', () => {
  it('favoris : produits retirés du catalogue ignorés, ordre conservé', () => {
    const list = resolveFavorites([CUBES.id, 'prd_inconnu', RIZ.id], mockProducts);
    expect(list.items.map((p) => p.id)).toEqual([CUBES.id, RIZ.id]);
  });

  it('liste : prix du moment, stock limité, format indisponible, format retiré compté à part', () => {
    const big = RIZ.variants.find((v) => mockStock.has(v.id))!;
    const list = resolveList(
      {
        id: 'lst_1',
        name: 'Courses',
        updatedAt: '2026-10-08T10:00:00.000Z',
        lines: [
          { variantId: RIZ.variants[0]!.id, quantity: 2 },
          { variantId: big.id, quantity: 99 },
          { variantId: CUBES.variants[0]!.id, quantity: 1 },
          { variantId: 'var_inconnu', quantity: 1 },
        ],
      },
      catalog,
    );
    expect(list.missingCount).toBe(1);
    expect(list.lines[0]).toMatchObject({ requestedQuantity: 2, quantity: 2, unitPrice: RIZ.variants[0]!.price });
    expect(list.lines[1]).toMatchObject({ requestedQuantity: 99, quantity: mockStock.get(big.id), status: 'quantity_reduced' });
    expect(list.lines[2]).toMatchObject({ status: 'unavailable', quantity: 0 });
  });

  it('ajout dans une liste : une ligne par format, quantité cumulée et plafonnée', () => {
    let lines = addToListLines([], { variantId: 'v1', quantity: 2 });
    lines = addToListLines(lines, { variantId: 'v1', quantity: 3 });
    lines = addToListLines(lines, { variantId: 'v2', quantity: 1 });
    expect(lines).toEqual([
      { variantId: 'v1', quantity: 5 },
      { variantId: 'v2', quantity: 1 },
    ]);
    expect(addToListLines(lines, { variantId: 'v1', quantity: 998 }, 999)[0]!.quantity).toBe(999);
  });
});

describe('cœur des favoris', () => {
  it('se remplit tout de suite, puis la réponse du serveur fait foi', async () => {
    const riz: ProductSummary = toSummary(RIZ);
    let resolve: (l: FavoriteList) => void = () => undefined;
    addFavorite.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useToggleFavorite(), { wrapper });

    await act(async () => {
      result.current.mutate({ product: riz, on: true });
    });
    await waitFor(() => expect(client.getQueryData<FavoriteList>(listsKeys.favorites)?.items.map((p) => p.id)).toEqual([riz.id]));
    await act(async () => resolve({ items: [riz] }));
    expect(addFavorite).toHaveBeenCalledWith(riz.id);
  });

  it('échec : l’état précédent est rétabli', async () => {
    client.setQueryData<FavoriteList>(listsKeys.favorites, { items: [] });
    addFavorite.mockRejectedValue(new Error('réseau'));
    const { result } = await renderHook(() => useToggleFavorite(), { wrapper });
    await act(async () => {
      result.current.mutate({ product: toSummary(RIZ), on: true });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<FavoriteList>(listsKeys.favorites)?.items).toEqual([]);
  });
});

describe('« Tout mettre au panier »', () => {
  it('produits disponibles ajoutés au panier ; indisponibles et réduits comptés', async () => {
    const big = RIZ.variants.find((v) => mockStock.has(v.id))!;
    getList.mockResolvedValue(
      resolveList(
        {
          id: 'lst_1',
          name: 'Courses',
          updatedAt: '2026-10-08T10:00:00.000Z',
          lines: [
            { variantId: RIZ.variants[0]!.id, quantity: 2 },
            { variantId: big.id, quantity: 99 },
            { variantId: CUBES.variants[0]!.id, quantity: 1 },
          ],
        },
        catalog,
      ),
    );
    const { result } = await renderHook(() => useListToCart('lst_1'), { wrapper });
    let outcome: { added: number; unavailable: number; reduced: number } | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync();
    });
    expect(outcome).toEqual({ added: 2, unavailable: 1, reduced: 1 });
    expect(useCart.getState().lines.map((l) => [l.variantId, l.quantity])).toEqual([
      [RIZ.variants[0]!.id, 2],
      [big.id, mockStock.get(big.id)],
    ]);
  });
});
