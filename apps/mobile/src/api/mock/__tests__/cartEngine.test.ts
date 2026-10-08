import type { CartValidateLine, ValidatedCart } from '@afrisime/shared';
import { ValidatedCart as ValidatedCartSchema , validateCart } from '@afrisime/shared';

import { buildCartChangeOverrides } from '../scenarios';
import { mockProducts, mockStock } from '@afrisime/fixtures';

const RIZ_5KG = 'var_riz-parfume-savana_0'; // 4 750 FCFA
const RIZ_50KG = 'var_riz-parfume-savana_2'; // 43 500 FCFA, stock 5
const HUILE_1L = 'var_huile-vegetale-golfe-dor_0'; // 1 300 FCFA
const CUBES = 'var_cubes-assaisonnement_0'; // indisponible

function line(variantId: string, quantity: number, expectedUnitPrice: number | null): CartValidateLine {
  return { variantId, quantity, expectedUnitPrice, expectedAvailability: 'available' };
}

function run(lines: CartValidateLine[], overrides?: Parameters<typeof validateCart>[1]['overrides']): ValidatedCart {
  const result = validateCart({ lines }, { products: mockProducts, stock: mockStock, overrides });
  // Toujours conforme au contrat partagé.
  return ValidatedCartSchema.parse(result);
}

describe('validateCart', () => {
  it('panier nominal : aucun changement, totaux entiers calculés par le « serveur »', () => {
    const r = run([line(RIZ_5KG, 2, 4750), line(HUILE_1L, 3, 1300)]);
    expect(r.changes).toEqual([]);
    expect(r.lines.map((l) => l.status)).toEqual(['ok', 'ok']);
    expect(r.subtotal).toBe(2 * 4750 + 3 * 1300);
    expect(r.total).toBe(r.subtotal);
    expect(r.itemCount).toBe(5);
    expect(Number.isInteger(r.total)).toBe(true);
  });

  it('prix différent de celui affiché → price_changed avec ancien et nouveau prix', () => {
    const r = run([line(RIZ_5KG, 1, 4900)]);
    expect(r.lines[0]?.status).toBe('price_changed');
    expect(r.changes).toEqual([
      expect.objectContaining({ type: 'price_changed', oldPrice: 4900, newPrice: 4750 }),
    ]);
    expect(r.subtotal).toBe(4750);
  });

  it('stock limité → quantité réduite', () => {
    const r = run([line(RIZ_50KG, 8, 43500)]);
    expect(r.lines[0]).toMatchObject({ status: 'quantity_reduced', quantity: 5, maxQuantity: 5, lineTotal: 5 * 43500 });
    expect(r.changes[0]).toMatchObject({ type: 'quantity_reduced', oldQuantity: 8, newQuantity: 5 });
  });

  it('produit indisponible → exclu du total, signalé une seule fois', () => {
    const first = run([line(CUBES, 2, 1200), line(HUILE_1L, 1, 1300)]);
    expect(first.lines[0]).toMatchObject({ status: 'unavailable', quantity: 0, lineTotal: 0 });
    expect(first.changes.map((c) => c.type)).toEqual(['unavailable']);
    expect(first.subtotal).toBe(1300);

    // L'app affiche déjà la ligne comme indisponible : pas de nouvelle alerte.
    const again = run([
      { variantId: CUBES, quantity: 2, expectedUnitPrice: 1200, expectedAvailability: 'unavailable' },
    ]);
    expect(again.changes).toEqual([]);
  });

  it('variante inconnue → retirée', () => {
    const r = run([line('var_inexistante', 1, 1000), line(HUILE_1L, 1, 1300)]);
    expect(r.lines).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ type: 'removed', variantId: 'var_inexistante' });
  });
});

describe('scénario « panier modifié »', () => {
  const lines = [line(RIZ_5KG, 1, 4750), line(HUILE_1L, 3, 1300), line('var_sucre-en-poudre_0', 2, 750)];
  const overrides = buildCartChangeOverrides({ lines }, mockProducts);

  it('produit les 3 types de changement', () => {
    const r = run(lines, overrides);
    expect(r.changes.map((c) => c.type).sort()).toEqual(['price_changed', 'quantity_reduced', 'unavailable']);
    expect(r.lines[0]?.unitPrice).toBe(5225); // 4 750 + 10 %, arrondi aux 25 FCFA
    expect(r.lines[1]?.quantity).toBe(2);
  });

  it('reste stable une fois le panier aligné (pas de boucle)', () => {
    const aligned: CartValidateLine[] = [
      line(RIZ_5KG, 1, 5225),
      line(HUILE_1L, 2, 1300),
      { variantId: 'var_sucre-en-poudre_0', quantity: 2, expectedUnitPrice: 750, expectedAvailability: 'unavailable' },
    ];
    expect(run(aligned, overrides).changes).toEqual([]);
  });
});
