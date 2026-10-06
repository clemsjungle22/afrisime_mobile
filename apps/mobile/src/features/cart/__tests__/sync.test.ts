import type { CartLine, ServerCart, ValidatedCart } from '@afrisime/shared';
import { cartApi } from '../api';
import { useCart } from '../store';
import { mergeCartLines, pullAndMergeCart } from '../sync';

jest.mock('../api', () => ({
  cartApi: { getServerCart: jest.fn(), putServerCart: jest.fn(), validate: jest.fn() },
}));
jest.mock('@/features/auth/session', () => ({ useSession: jest.fn() }));

const api = cartApi as jest.Mocked<typeof cartApi>;

describe('mergeCartLines', () => {
  it('union des paniers, plus grande quantité en cas de doublon (jamais la somme)', () => {
    const local: CartLine[] = [
      { variantId: 'a', quantity: 2 },
      { variantId: 'b', quantity: 1 },
    ];
    const server: CartLine[] = [
      { variantId: 'b', quantity: 4 },
      { variantId: 'c', quantity: 3 },
    ];
    expect(mergeCartLines(local, server)).toEqual([
      { variantId: 'a', quantity: 2 },
      { variantId: 'b', quantity: 4 },
      { variantId: 'c', quantity: 3 },
    ]);
  });

  it('idempotent : refusionner ne change rien', () => {
    const lines: CartLine[] = [{ variantId: 'a', quantity: 2 }];
    expect(mergeCartLines(lines, lines)).toEqual(lines);
  });
});

describe('pullAndMergeCart', () => {
  beforeEach(() => {
    useCart.getState().clear();
    jest.clearAllMocks();
  });

  it('complète les lignes connues du seul serveur puis renvoie le panier fusionné', async () => {
    useCart.getState().add(
      { slug: 'riz', name: 'Riz', brand: 'Savana', color: '#b7862b', imageUrl: null },
      { id: 'a', sku: 'a', label: 'Sac 5 kg', packaging: 'sac', price: 4750, compareAtPrice: null, availability: 'available', leadTimeDays: null, minQuantity: 1, isPro: false },
      1,
    );
    const server: ServerCart = { lines: [{ variantId: 'h', quantity: 2 }], updatedAt: '2026-10-06T10:00:00.000Z' };
    api.getServerCart.mockResolvedValue(server);
    api.validate.mockResolvedValue({
      lines: [
        {
          variantId: 'h',
          productSlug: 'huile',
          productName: 'Huile végétale',
          brand: "Golfe d'Or",
          variantLabel: 'Bouteille 1 L',
          imageUrl: null,
          color: '#c2791b',
          availability: 'available',
          leadTimeDays: null,
          minQuantity: 1,
          maxQuantity: null,
          unitPrice: 1300,
          requestedQuantity: 2,
          quantity: 2,
          lineTotal: 2600,
          status: 'ok',
        },
      ],
      changes: [],
      subtotal: 2600,
      discountTotal: 0,
      total: 2600,
      itemCount: 2,
      currency: 'XOF',
      validatedAt: '2026-10-06T10:00:00.000Z',
    } satisfies ValidatedCart);
    api.putServerCart.mockResolvedValue(server);

    await pullAndMergeCart();

    const lines = useCart.getState().lines;
    expect(lines.map((l) => [l.variantId, l.quantity])).toEqual([
      ['a', 1],
      ['h', 2],
    ]);
    expect(lines[1]?.snapshot).toMatchObject({ name: 'Huile végétale', unitPrice: 1300 });
    expect(api.putServerCart).toHaveBeenCalledWith([
      { variantId: 'a', quantity: 1 },
      { variantId: 'h', quantity: 2 },
    ]);
  });
});
