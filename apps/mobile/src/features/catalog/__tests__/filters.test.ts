import type { Facets } from '@afrisime/shared';
import {
  activeFilters,
  countActiveFilters,
  defaultSort,
  parseFilterParams,
  toFilterParams,
  type CatalogFilters,
} from '../filters';

const NBSP = ' ';

describe('parseFilterParams', () => {
  it('convertit les paramètres de route en filtres typés', () => {
    expect(
      parseFilterParams({
        q: ' huile ',
        category: 'huiles',
        minPrice: '1000',
        maxPrice: '5000',
        availability: 'on_order',
        offer: 'pro',
        sort: 'price_asc',
      }),
    ).toEqual({
      q: 'huile',
      category: 'huiles',
      minPrice: 1000,
      maxPrice: 5000,
      availability: 'on_order',
      offer: 'pro',
      sort: 'price_asc',
    });
  });

  it('ignore les valeurs invalides sans planter', () => {
    expect(
      parseFilterParams({
        category: 'Huiles; DROP',
        minPrice: 'abc',
        availability: 'bientot',
        sort: 'random',
        origin: 'local',
      }),
    ).toEqual({ origin: 'local' });
  });

  it('prend la première valeur si un paramètre est répété', () => {
    expect(parseFilterParams({ brand: ['Savana', 'Aïcha'] })).toEqual({ brand: 'Savana' });
  });

  it('remet dans l’ordre des bornes de prix inversées', () => {
    expect(parseFilterParams({ minPrice: '5000', maxPrice: '1000' })).toEqual({ minPrice: 1000, maxPrice: 5000 });
  });
});

describe('toFilterParams', () => {
  it('aller-retour sans perte', () => {
    const filters: CatalogFilters = { q: 'riz', category: 'cereales-farines', minPrice: 1000, offer: 'promotion' };
    expect(parseFilterParams(toFilterParams(filters))).toEqual(filters);
  });

  it('les clés absentes sont explicitement undefined (retirées de l’URL)', () => {
    const params = toFilterParams({ category: 'huiles' });
    expect(params).toHaveProperty('brand', undefined);
    expect(params).toHaveProperty('q', undefined);
    expect(params.category).toBe('huiles');
  });
});

describe('countActiveFilters', () => {
  it('ne compte ni la recherche ni le tri, et le prix une seule fois', () => {
    expect(countActiveFilters({ q: 'riz', sort: 'newest' })).toBe(0);
    expect(countActiveFilters({ minPrice: 1000, maxPrice: 5000, origin: 'local' })).toBe(2);
  });

  it('peut ignorer un filtre piloté ailleurs', () => {
    expect(countActiveFilters({ category: 'huiles', brand: 'Aïcha' }, ['category'])).toBe(1);
  });
});

describe('activeFilters', () => {
  const facets: Facets = {
    category: [{ value: 'huiles', label: 'Huiles', count: 3 }],
    brand: [],
    availability: [{ value: 'on_order', label: 'Sur commande', count: 2 }],
    packaging: [],
    origin: [],
    offer: [],
  };

  it('libellés issus des facettes et retrait individuel', () => {
    const filters: CatalogFilters = { category: 'huiles', availability: 'on_order', maxPrice: 5000 };
    const chips = activeFilters(filters, facets);
    expect(chips.map((c) => c.label)).toEqual(['Huiles', 'Sur commande', `Jusqu'à 5${NBSP}000${NBSP}FCFA`]);

    const withoutPrice = chips.find((c) => c.id === 'price')!.remove(filters);
    expect(withoutPrice).toEqual({ category: 'huiles', availability: 'on_order' });
  });

  it('valeur brute si la facette est inconnue', () => {
    expect(activeFilters({ brand: 'Savana' }, undefined)[0]?.label).toBe('Savana');
  });
});

describe('defaultSort', () => {
  it('pertinence en recherche, popularité sinon', () => {
    expect(defaultSort({ q: 'riz' })).toBe('relevance');
    expect(defaultSort({})).toBe('popular');
  });
});
