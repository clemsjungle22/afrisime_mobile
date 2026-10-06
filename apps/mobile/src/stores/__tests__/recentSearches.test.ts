import { useRecentSearches } from '../recentSearches';

beforeEach(() => {
  useRecentSearches.getState().clear();
});

describe('recherches récentes', () => {
  it('la plus récente en premier, sans doublon (casse ignorée)', () => {
    const { add } = useRecentSearches.getState();
    add('riz');
    add('huile');
    add('RIZ');
    expect(useRecentSearches.getState().items).toEqual(['RIZ', 'huile']);
  });

  it('ignore les saisies trop courtes', () => {
    useRecentSearches.getState().add(' a ');
    expect(useRecentSearches.getState().items).toEqual([]);
  });

  it('garde au plus 8 recherches', () => {
    for (let i = 0; i < 12; i++) useRecentSearches.getState().add(`produit ${i}`);
    const items = useRecentSearches.getState().items;
    expect(items).toHaveLength(8);
    expect(items[0]).toBe('produit 11');
  });

  it('retire une recherche', () => {
    useRecentSearches.getState().add('gari');
    useRecentSearches.getState().add('savon');
    useRecentSearches.getState().remove('GARI');
    expect(useRecentSearches.getState().items).toEqual(['savon']);
  });
});
