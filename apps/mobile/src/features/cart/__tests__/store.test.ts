import type { ProductSummary, ValidatedCart, Variant } from '@afrisime/shared';
import { clampQuantity, countItems, estimateSubtotal, toValidateRequest, useCart } from '../store';

const product: Pick<ProductSummary, 'slug' | 'name' | 'brand' | 'color' | 'imageUrl'> = {
  slug: 'riz',
  name: 'Riz parfumé',
  brand: 'Savana',
  color: '#b7862b',
  imageUrl: null,
};

function variant(id: string, price: number | null, overrides: Partial<Variant> = {}): Variant {
  return {
    id,
    sku: id,
    label: 'Sac 5 kg',
    packaging: 'sac',
    price,
    compareAtPrice: null,
    availability: 'available',
    leadTimeDays: null,
    minQuantity: 1,
    isPro: false,
    ...overrides,
  };
}

const cart = () => useCart.getState();

beforeEach(() => cart().clear());

describe('panier local', () => {
  it('ajoute puis cumule le même format', () => {
    cart().add(product, variant('v1', 4750), 2);
    const total = cart().add(product, variant('v1', 4750), 3);
    expect(total).toBe(5);
    expect(cart().lines).toHaveLength(1);
    expect(cart().lines[0]?.quantity).toBe(5);
  });

  it('respecte le minimum de commande et le plafond', () => {
    cart().add(product, variant('v1', 1000, { minQuantity: 3 }), 1);
    expect(cart().lines[0]?.quantity).toBe(3);
    cart().setQuantity('v1', 1);
    expect(cart().lines[0]?.quantity).toBe(3);
    cart().setQuantity('v1', 5000);
    expect(cart().lines[0]?.quantity).toBe(999);
    expect(clampQuantity(Number.NaN, 2)).toBe(2);
  });

  it('retire puis restaure à la même position (« Annuler »)', () => {
    cart().add(product, variant('a', 100), 1);
    cart().add(product, variant('b', 200), 1);
    cart().add(product, variant('c', 300), 1);
    const removed = cart().remove('b');
    expect(cart().lines.map((l) => l.variantId)).toEqual(['a', 'c']);
    cart().restore(removed!.line, removed!.index);
    expect(cart().lines.map((l) => l.variantId)).toEqual(['a', 'b', 'c']);
    // Pas de doublon si on restaure deux fois.
    cart().restore(removed!.line, removed!.index);
    expect(cart().lines).toHaveLength(3);
  });

  it('compte et estime sans les lignes indisponibles', () => {
    cart().add(product, variant('a', 1000), 2);
    cart().add(product, variant('b', 500, { availability: 'unavailable' }), 4);
    expect(countItems(cart().lines)).toBe(2);
    expect(estimateSubtotal(cart().lines)).toBe(2000);
  });

  it('envoie au serveur les prix et disponibilités affichés', () => {
    cart().add(product, variant('a', 1000), 2);
    expect(toValidateRequest(cart().lines)).toEqual({
      lines: [{ variantId: 'a', quantity: 2, expectedUnitPrice: 1000, expectedAvailability: 'available' }],
    });
  });

  it('s’aligne sur la revalidation serveur', () => {
    cart().add(product, variant('prix', 4750), 1);
    cart().add(product, variant('stock', 1000), 8);
    cart().add(product, variant('rupture', 500), 2);
    cart().add(product, variant('retire', 300), 1);

    const base = {
      productSlug: 'riz',
      productName: 'Riz',
      brand: 'Savana',
      variantLabel: 'Sac',
      imageUrl: null,
      color: '#b7862b',
      leadTimeDays: null,
      minQuantity: 1,
    };
    const validated: ValidatedCart = {
      lines: [
        { ...base, variantId: 'prix', availability: 'available', maxQuantity: null, unitPrice: 5225, requestedQuantity: 1, quantity: 1, lineTotal: 5225, status: 'price_changed' },
        { ...base, variantId: 'stock', availability: 'available', maxQuantity: 5, unitPrice: 1000, requestedQuantity: 8, quantity: 5, lineTotal: 5000, status: 'quantity_reduced' },
        { ...base, variantId: 'rupture', availability: 'unavailable', maxQuantity: null, unitPrice: 500, requestedQuantity: 2, quantity: 0, lineTotal: 0, status: 'unavailable' },
      ],
      changes: [],
      subtotal: 10225,
      discountTotal: 0,
      total: 10225,
      itemCount: 6,
      currency: 'XOF',
      validatedAt: '2026-10-06T10:00:00.000Z',
    };
    cart().applyValidation(validated);

    const byId = Object.fromEntries(cart().lines.map((l) => [l.variantId, l]));
    expect(byId.prix?.snapshot.unitPrice).toBe(5225);
    expect(byId.stock?.quantity).toBe(5);
    expect(byId.rupture?.snapshot.availability).toBe('unavailable');
    expect(byId.rupture?.quantity).toBe(2);
    expect(byId.retire).toBeUndefined();
  });
});
