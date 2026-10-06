import type { Category } from '@afrisime/shared';

/** Rayons du site AfriSime (libellés, descriptions et couleurs repris du site). */
export const mockCategories: Category[] = [
  {
    id: 'cat_epicerie',
    slug: 'epicerie',
    name: 'Épicerie',
    description: 'Sucre, sel, pâtes, conserves, condiments et essentiels du quotidien.',
    imageUrl: null,
    color: '#2e7d5b',
    productCount: 0,
    children: [],
  },
  {
    id: 'cat_boissons',
    slug: 'boissons',
    name: 'Boissons',
    description: 'Eaux, jus, sodas, boissons maltées et boissons locales.',
    imageUrl: null,
    color: '#1f6f8b',
    productCount: 0,
    children: [],
  },
  {
    id: 'cat_cereales',
    slug: 'cereales-farines',
    name: 'Céréales & farines',
    description: 'Riz, maïs, mil, farines et semoules, au détail comme en sac.',
    imageUrl: null,
    color: '#b7862b',
    productCount: 0,
    children: [],
  },
  {
    id: 'cat_huiles',
    slug: 'huiles',
    name: 'Huiles',
    description: 'Huiles végétales, huile de palme rouge, huiles de cuisson en bidon.',
    imageUrl: null,
    color: '#c2791b',
    productCount: 0,
    children: [],
  },
  {
    id: 'cat_locaux',
    slug: 'produits-locaux',
    name: 'Produits locaux',
    description: 'Le meilleur du Togo et de la sous-région : gari, soja, karité, épices.',
    imageUrl: null,
    color: '#4f8a2b',
    productCount: 0,
    children: [],
  },
  {
    id: 'cat_hygiene',
    slug: 'hygiene-entretien',
    name: 'Hygiène & entretien',
    description: "Savons, détergents et produits d'entretien pour la maison et les pros.",
    imageUrl: null,
    color: '#6b5ca5',
    productCount: 0,
    children: [],
  },
];

export function findCategory(slug: string): Category | undefined {
  return mockCategories.find((c) => c.slug === slug);
}
