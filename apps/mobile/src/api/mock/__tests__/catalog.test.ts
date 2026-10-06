import { Home, ProductDetail } from '@afrisime/shared';
import type { z } from 'zod';
import { mockCatalogApi } from '../catalog';

// Pas de latence ni d'erreur aléatoire en test : on garde la validation par schéma.
jest.mock('../simulate', () => {
  const actual = jest.requireActual<typeof import('../simulate')>('../simulate');
  return {
    ...actual,
    simulate: <S extends z.ZodType>(schema: S, produce: () => unknown) =>
      Promise.resolve().then(() => schema.parse(produce())),
  };
});

describe('mockCatalogApi', () => {
  it('pagine par curseur sans doublon', async () => {
    const first = await mockCatalogApi.listProducts({ limit: 8 });
    expect(first.items).toHaveLength(8);
    expect(first.nextCursor).not.toBeNull();

    const second = await mockCatalogApi.listProducts({ limit: 8, cursor: first.nextCursor ?? undefined });
    const ids = new Set([...first.items, ...second.items].map((p) => p.id));
    expect(ids.size).toBe(first.items.length + second.items.length);
  });

  it('dernière page : nextCursor null', async () => {
    const all = await mockCatalogApi.listProducts({ limit: 50 });
    expect(all.nextCursor).toBeNull();
  });

  it('filtre par rayon', async () => {
    const page = await mockCatalogApi.listProducts({ category: 'huiles', limit: 50 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const p of page.items) expect(p.color).toBe('#c2791b');
  });

  it('couvre les 4 états de disponibilité', async () => {
    const all = await mockCatalogApi.listProducts({ limit: 50 });
    const details = await Promise.all(all.items.map((p) => mockCatalogApi.getProduct(p.slug)));
    const states = new Set(details.flatMap((d) => d.variants.map((v) => v.availability)));
    expect(states).toEqual(new Set(['available', 'on_order', 'unavailable', 'quote_only']));
  });

  it('fiche produit conforme au contrat, avec produits associés', async () => {
    const product = await mockCatalogApi.getProduct('riz-parfume-savana');
    expect(() => ProductDetail.parse(product)).not.toThrow();
    expect(product.related.length).toBeGreaterThan(0);
    expect(product.related.some((r) => r.slug === product.slug)).toBe(false);
  });

  it('produit inconnu : NOT_FOUND', async () => {
    await expect(mockCatalogApi.getProduct('inexistant')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('accueil conforme au contrat, rayons comptés', async () => {
    const home = await mockCatalogApi.getHome();
    expect(() => Home.parse(home)).not.toThrow();
    expect(home.categories).toHaveLength(6);
    expect(home.sections.find((s) => s.type === 'flash_sale')?.endsAt).not.toBeNull();

    const categories = await mockCatalogApi.listCategories();
    expect(categories.every((c) => c.productCount > 0)).toBe(true);
  });
});
