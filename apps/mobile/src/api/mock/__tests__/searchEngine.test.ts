import { mockProducts } from '@afrisime/fixtures';
import { editDistance, normalize, searchProducts, suggest } from '../searchEngine';

const names = (r: ReturnType<typeof searchProducts>) => r.items.map((p) => p.slug);

describe('normalize / editDistance', () => {
  it('ignore accents, casse et ponctuation', () => {
    expect(normalize('Huile végétale, RAFFINÉE')).toBe('huile vegetale raffinee');
  });

  it('compte une inversion de lettres comme une seule faute', () => {
    expect(editDistance('hiule', 'huile')).toBe(1);
    expect(editDistance('savon', 'savon')).toBe(0);
    expect(editDistance('riz', 'sucre', 1)).toBeGreaterThan(1);
  });
});

describe('searchProducts — texte', () => {
  it('insensible aux accents', () => {
    expect(names(searchProducts(mockProducts, { q: 'vegetale' }))).toContain('huile-vegetale-golfe-dor');
    expect(names(searchProducts(mockProducts, { q: 'mais' }))).toContain('mais-grain-blanc');
  });

  it('préfixe : « sav » trouve le savon', () => {
    expect(names(searchProducts(mockProducts, { q: 'sav' }))).toContain('savon-maison-claire');
  });

  it('cherche aussi dans la marque et le rayon', () => {
    expect(names(searchProducts(mockProducts, { q: 'aqua lome' }))).toEqual(['eau-minerale-aqua-lome']);
    expect(searchProducts(mockProducts, { q: 'boissons' }).items.length).toBeGreaterThan(1);
  });

  it('tolère une faute de frappe et renvoie la correction', () => {
    const r = searchProducts(mockProducts, { q: 'hiule' });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((p) => normalize(p.name + ' ' + p.categoryId).includes('huile'))).toBe(true);
    expect(r.correctedQuery).toBe('huile');
  });

  it('pas de correction quand la saisie est juste', () => {
    expect(searchProducts(mockProducts, { q: 'huile' }).correctedQuery).toBeNull();
  });

  it('aucun résultat pour un mot inconnu', () => {
    const r = searchProducts(mockProducts, { q: 'ordinateur' });
    expect(r.items).toHaveLength(0);
    expect(r.priceBounds).toBeNull();
  });

  it('pertinence : le nom qui commence par la requête passe devant', () => {
    expect(names(searchProducts(mockProducts, { q: 'huile' }))[0]).toMatch(/^huile/);
  });
});

describe('searchProducts — filtres', () => {
  it('rayon + origine', () => {
    const r = searchProducts(mockProducts, { category: 'huiles', origin: 'local' });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((p) => p.categoryId === 'huiles' && p.origin === 'local')).toBe(true);
  });

  it('prix : au moins un format dans la fourchette', () => {
    const r = searchProducts(mockProducts, { minPrice: 20000 });
    expect(r.items.every((p) => p.variants.some((v) => v.price !== null && v.price >= 20000))).toBe(true);
  });

  it('offres : formats pro', () => {
    const r = searchProducts(mockProducts, { offer: 'pro' });
    expect(r.items.every((p) => p.variants.some((v) => v.isPro) || p.badges.includes('b2b'))).toBe(true);
  });

  it('disponibilité : sur devis', () => {
    expect(names(searchProducts(mockProducts, { availability: 'quote_only' }))).toEqual(['lait-en-poudre']);
  });
});

describe('searchProducts — facettes', () => {
  it('une facette ignore son propre filtre (on voit les autres rayons)', () => {
    const r = searchProducts(mockProducts, { category: 'huiles' });
    expect(r.facets.category.length).toBe(6);
    const huiles = r.facets.category.find((f) => f.value === 'huiles');
    expect(huiles?.count).toBe(r.items.length);
  });

  it('les autres facettes respectent le filtre actif', () => {
    const r = searchProducts(mockProducts, { category: 'huiles' });
    const brands = r.facets.brand.map((b) => b.value);
    expect(brands).not.toContain('Savana');
    expect(r.facets.brand.reduce((n, b) => n + b.count, 0)).toBe(r.items.length);
  });

  it('libellés lisibles', () => {
    const r = searchProducts(mockProducts, {});
    expect(r.facets.origin.map((o) => o.label).sort()).toEqual(['Importé', 'Local']);
    expect(r.facets.offer.find((o) => o.value === 'pro')?.label).toBe('Formats pro');
  });
});

describe('searchProducts — tris', () => {
  const prices = (r: ReturnType<typeof searchProducts>) => r.items.map((p) => p.priceFrom ?? Infinity);

  it('prix croissant (sur devis en dernier)', () => {
    const p = prices(searchProducts(mockProducts, { sort: 'price_asc' }));
    expect(p).toEqual([...p].sort((a, b) => a - b));
  });

  it('prix décroissant', () => {
    const r = searchProducts(mockProducts, { sort: 'price_desc' });
    const p = r.items.map((x) => x.priceFrom ?? -1);
    expect(p).toEqual([...p].sort((a, b) => b - a));
  });

  it('nouveautés en tête', () => {
    expect(searchProducts(mockProducts, { sort: 'newest' }).items[0]?.badges).toContain('new');
  });
});

describe('suggest', () => {
  it('rien sous 2 caractères', () => {
    expect(suggest(mockProducts, 'h').suggestions).toEqual([]);
  });

  it('propose rayon, marque et produits', () => {
    const { suggestions } = suggest(mockProducts, 'huil');
    expect(suggestions.some((s) => s.type === 'category' && s.value === 'huiles')).toBe(true);
    expect(suggestions.some((s) => s.type === 'product')).toBe(true);

    const brand = suggest(mockProducts, 'terroir').suggestions;
    expect(brand.some((s) => s.type === 'brand' && s.value === 'Terroir Togo')).toBe(true);
  });

  it('propose une correction', () => {
    expect(suggest(mockProducts, 'savn').correctedQuery).toBe('savon');
  });
});
