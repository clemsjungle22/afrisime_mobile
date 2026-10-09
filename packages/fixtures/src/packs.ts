import { variantId } from './products';

/** Packs Famille d'exemple (base de données et mode démo). Prix inférieurs à la valeur des produits. */
export type PackSeed = {
  id: string;
  name: string;
  description: string;
  price: number;
  durationDays: number;
  items: { variantId: string; quantity: number }[];
};

export const packSeeds: readonly PackSeed[] = [
  {
    id: 'pack_quinzaine',
    name: 'Pack Famille Quinzaine',
    description: 'L’essentiel de la cuisine pour une famille, à cotiser en 15 jours.',
    price: 19_500,
    durationDays: 15,
    items: [
      { variantId: variantId('riz-parfume-savana', 0), quantity: 2 },
      { variantId: variantId('huile-vegetale-golfe-dor', 0), quantity: 3 },
      { variantId: variantId('sucre-en-poudre', 0), quantity: 2 },
      { variantId: variantId('tomate-concentree-double', 0), quantity: 4 },
      { variantId: variantId('spaghetti', 0), quantity: 4 },
      { variantId: variantId('savon-maison-claire', 0), quantity: 4 },
    ],
  },
  {
    id: 'pack_trentaine',
    name: 'Pack Famille Trentaine',
    description: 'Les grandes courses du mois, à cotiser en 30 jours.',
    price: 48_000,
    durationDays: 30,
    items: [
      { variantId: variantId('riz-parfume-savana', 1), quantity: 1 },
      { variantId: variantId('huile-vegetale-golfe-dor', 1), quantity: 1 },
      { variantId: variantId('sucre-en-poudre', 0), quantity: 5 },
      { variantId: variantId('tomate-concentree-double', 0), quantity: 8 },
      { variantId: variantId('spaghetti', 0), quantity: 10 },
      { variantId: variantId('gari-extra-blanc', 0), quantity: 2 },
      { variantId: variantId('savon-maison-claire', 0), quantity: 6 },
      { variantId: variantId('lait-en-poudre', 0), quantity: 2 },
    ],
  },
];
