import { create } from 'zustand';
import {
  type CartValidateRequest,
  type CatalogOverrides,
  type ProductDetail,
  findVariant,
  noOverrides,
} from '@afrisime/shared';

/**
 * Scénarios de test du mode mock, pilotés depuis l'onglet Compte (mode démo).
 * Non persistés : chaque lancement de l'app repart du comportement nominal.
 */
type MockScenarios = {
  /** Armé : le prochain contrôle du panier fige un prix modifié, une quantité réduite et une rupture. */
  cartChangeArmed: boolean;
  overrides: CatalogOverrides;
  armCartChange: () => void;
  setOverrides: (overrides: CatalogOverrides) => void;
  reset: () => void;
};

export const useMockScenarios = create<MockScenarios>()((set) => ({
  cartChangeArmed: false,
  overrides: noOverrides,
  armCartChange: () => set({ cartChangeArmed: true }),
  setOverrides: (overrides) => set({ overrides, cartChangeArmed: false }),
  reset: () => set({ cartChangeArmed: false, overrides: noOverrides }),
}));

export { noOverrides };
export type { CatalogOverrides };

/** Arrondi commercial aux 25 FCFA (montants entiers). */
function roundPrice(n: number): number {
  return Math.round(n / 25) * 25;
}

/**
 * Scénario « panier modifié » : à partir du panier courant, +10 % sur la 1re ligne,
 * stock réduit d'une unité sur la 2e, rupture sur la 3e.
 */
export function buildCartChangeOverrides(request: CartValidateRequest, products: ProductDetail[]): CatalogOverrides {
  const prices = new Map<string, number>();
  const stock = new Map<string, number>();
  const unavailable = new Set<string>();
  request.lines.forEach((line, index) => {
    const variant = findVariant(products, line.variantId)?.variant;
    if (!variant) return;
    if (index === 0 && variant.price !== null) prices.set(variant.id, roundPrice(variant.price * 1.1));
    if (index === 1) stock.set(variant.id, Math.max(1, line.quantity - 1));
    if (index === 2) unavailable.add(variant.id);
  });
  return { prices, stock, unavailable };
}
