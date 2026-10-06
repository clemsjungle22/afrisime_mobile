import { create } from 'zustand';

/** Modifications « serveur » simulées, stables d'une revalidation à l'autre. */
export type CatalogOverrides = {
  prices: ReadonlyMap<string, number>;
  stock: ReadonlyMap<string, number>;
  unavailable: ReadonlySet<string>;
};

export const noOverrides: CatalogOverrides = {
  prices: new Map(),
  stock: new Map(),
  unavailable: new Set(),
};

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
