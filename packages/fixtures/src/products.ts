import type { Availability, ProductDetail, ProductSummary, Variant } from '@afrisime/shared';
import { relatedOf, summarizeVariants, toSummary } from '@afrisime/shared';
import { findCategory } from './categories';

/**
 * Catalogue d'exemple inspiré du site AfriSime (noms, rayons, fourchettes de prix).
 * Données FICTIVES en attendant le vrai catalogue géré par le back-office.
 */

export type SeedVariant = {
  label: string;
  packaging: string;
  price: number | null;
  compareAtPrice?: number;
  availability?: Availability;
  leadTimeDays?: number;
  minQuantity?: number;
  isPro?: boolean;
  /** Stock limité (unités), absent = non limité. */
  stock?: number;
};

export type ProductSeed = {
  slug: string;
  name: string;
  brand: string;
  origin: 'local' | 'imported';
  category: string;
  description: string;
  badges?: ProductSummary['badges'];
  variants: SeedVariant[];
};

const seeds: ProductSeed[] = [
  // Céréales & farines
  {
    slug: 'riz-parfume-savana',
    name: 'Riz parfumé long grain',
    brand: 'Savana',
    origin: 'imported',
    category: 'cereales-farines',
    description: 'Riz long grain parfumé, grains fins qui restent détachés à la cuisson.',
    badges: ['popular', 'promotion'],
    variants: [
      { label: 'Sac 5 kg', packaging: 'sac', price: 4750, compareAtPrice: 5200 },
      { label: 'Sac 25 kg', packaging: 'sac', price: 22500 },
      { label: 'Sac 50 kg', packaging: 'sac', price: 43500, isPro: true, stock: 5 },
    ],
  },
  {
    slug: 'mais-grain-blanc',
    name: 'Maïs grain blanc',
    brand: 'Terroir Togo',
    origin: 'local',
    category: 'cereales-farines',
    description: 'Maïs blanc sec, idéal pour la pâte et la farine.',
    variants: [
      { label: 'Sac 10 kg', packaging: 'sac', price: 3500 },
      { label: 'Sac 100 kg', packaging: 'sac', price: 31000, isPro: true, stock: 4 },
    ],
  },
  {
    slug: 'farine-de-ble',
    name: 'Farine de blé T55',
    brand: 'Grands Moulins',
    origin: 'imported',
    category: 'cereales-farines',
    description: 'Farine de blé tout usage pour pain, beignets et pâtisserie.',
    badges: ['new'],
    variants: [
      { label: 'Paquet 1 kg', packaging: 'paquet', price: 800 },
      { label: 'Sac 50 kg', packaging: 'sac', price: 27500, isPro: true },
    ],
  },
  {
    slug: 'mil-local',
    name: 'Mil décortiqué',
    brand: 'Terroir Togo',
    origin: 'local',
    category: 'cereales-farines',
    description: 'Mil décortiqué du nord Togo, pour bouillies et couscous.',
    variants: [{ label: 'Sac 5 kg', packaging: 'sac', price: 3250, availability: 'on_order', leadTimeDays: 4 }],
    badges: ['on_order'],
  },
  // Huiles
  {
    slug: 'huile-vegetale-golfe-dor',
    name: 'Huile végétale raffinée',
    brand: "Golfe d'Or",
    origin: 'local',
    category: 'huiles',
    description: 'Huile végétale raffinée pour la cuisson et la friture.',
    badges: ['popular'],
    variants: [
      { label: 'Bouteille 1 L', packaging: 'bouteille', price: 1300 },
      { label: 'Bidon 5 L', packaging: 'bidon', price: 6200 },
      { label: 'Bidon 20 L', packaging: 'bidon', price: 23500, isPro: true },
    ],
  },
  {
    slug: 'huile-aicha-25l',
    name: 'Huile Aïcha 25 L',
    brand: 'Aïcha',
    origin: 'imported',
    category: 'huiles',
    description: 'Format professionnel pour restaurants et revendeurs.',
    badges: ['b2b'],
    variants: [{ label: 'Bidon 25 L', packaging: 'bidon', price: 29500, isPro: true, stock: 3 }],
  },
  {
    slug: 'huile-de-palme-rouge',
    name: 'Huile de palme rouge',
    brand: 'Terroir Togo',
    origin: 'local',
    category: 'huiles',
    description: 'Huile de palme rouge artisanale, pressée à la commande.',
    badges: ['on_order'],
    variants: [
      { label: 'Bouteille 1 L', packaging: 'bouteille', price: 1200, availability: 'on_order', leadTimeDays: 3 },
      { label: 'Bidon 5 L', packaging: 'bidon', price: 5500, availability: 'on_order', leadTimeDays: 3 },
    ],
  },
  // Épicerie
  {
    slug: 'sucre-en-poudre',
    name: 'Sucre en poudre',
    brand: 'Sucrerie du Golfe',
    origin: 'imported',
    category: 'epicerie',
    description: 'Sucre blanc cristallisé.',
    badges: ['popular'],
    variants: [
      { label: 'Paquet 1 kg', packaging: 'paquet', price: 750 },
      { label: 'Sac 50 kg', packaging: 'sac', price: 34000, isPro: true },
    ],
  },
  {
    slug: 'tomate-concentree-double',
    name: 'Tomate concentrée double',
    brand: 'Bella Tomata',
    origin: 'imported',
    category: 'epicerie',
    description: 'Concentré de tomate 28 %, pour sauces et ragoûts.',
    badges: ['promotion'],
    variants: [
      { label: 'Boîte 400 g', packaging: 'boîte', price: 600, compareAtPrice: 700 },
      { label: 'Carton 24 boîtes', packaging: 'carton', price: 13200, isPro: true },
    ],
  },
  {
    slug: 'cubes-assaisonnement',
    name: "Cubes d'assaisonnement",
    brand: 'AfriSime Sélection',
    origin: 'imported',
    category: 'epicerie',
    description: 'Bouillon cube pour assaisonner sauces et ragoûts.',
    badges: ['out_of_stock'],
    variants: [{ label: 'Boîte 60 cubes', packaging: 'boîte', price: 1200, availability: 'unavailable' }],
  },
  {
    slug: 'lait-en-poudre',
    name: 'Lait entier en poudre',
    brand: 'AfriSime Sélection',
    origin: 'imported',
    category: 'epicerie',
    description: 'Lait entier en poudre, conditionnement grossiste sur devis.',
    badges: ['b2b'],
    variants: [
      { label: 'Boîte 400 g', packaging: 'boîte', price: 2400 },
      { label: 'Sac 25 kg', packaging: 'sac', price: null, availability: 'quote_only', isPro: true },
    ],
  },
  {
    slug: 'spaghetti',
    name: 'Spaghetti',
    brand: 'Pasta Mia',
    origin: 'imported',
    category: 'epicerie',
    description: 'Pâtes de blé dur, cuisson 9 minutes.',
    variants: [
      { label: 'Paquet 500 g', packaging: 'paquet', price: 450 },
      { label: 'Carton 20 paquets', packaging: 'carton', price: 8500, isPro: true },
    ],
  },
  // Boissons
  {
    slug: 'eau-minerale-aqua-lome',
    name: 'Eau minérale naturelle',
    brand: 'Aqua Lomé',
    origin: 'local',
    category: 'boissons',
    description: 'Eau minérale naturelle embouteillée à Lomé.',
    badges: ['popular'],
    variants: [
      { label: 'Fardeau 12 × 0,5 L', packaging: 'fardeau', price: 1500 },
      { label: 'Fardeau 6 × 1,5 L', packaging: 'fardeau', price: 1800 },
    ],
  },
  {
    slug: 'jus-de-bissap',
    name: 'Jus de bissap',
    brand: 'Terroir Togo',
    origin: 'local',
    category: 'boissons',
    description: "Boisson à la fleur d'hibiscus, peu sucrée.",
    badges: ['new'],
    variants: [
      { label: 'Bouteille 1 L', packaging: 'bouteille', price: 900 },
      { label: 'Carton 12 × 1 L', packaging: 'carton', price: 10000, isPro: true },
    ],
  },
  {
    slug: 'boisson-maltee',
    name: 'Boisson maltée',
    brand: 'Malta Golfe',
    origin: 'imported',
    category: 'boissons',
    description: 'Boisson maltée sans alcool.',
    variants: [{ label: 'Pack 6 canettes', packaging: 'pack', price: 2700 }],
  },
  // Produits locaux
  {
    slug: 'gari-extra-blanc',
    name: 'Gari extra blanc',
    brand: 'Terroir Togo',
    origin: 'local',
    category: 'produits-locaux',
    description: 'Gari de manioc fin et croustillant, produit au Togo.',
    badges: ['popular'],
    variants: [
      { label: 'Sachet 2 kg', packaging: 'sachet', price: 1200 },
      { label: 'Sac 25 kg', packaging: 'sac', price: 13500, isPro: true },
    ],
  },
  {
    slug: 'soja-grain',
    name: 'Soja en grain',
    brand: 'Terroir Togo',
    origin: 'local',
    category: 'produits-locaux',
    description: 'Soja local pour fromage de soja, lait et farine.',
    variants: [{ label: 'Sachet 1 kg', packaging: 'sachet', price: 900 }],
  },
  {
    slug: 'beurre-de-karite',
    name: 'Beurre de karité brut',
    brand: 'Karité des Savanes',
    origin: 'local',
    category: 'produits-locaux',
    description: 'Beurre de karité non raffiné, usage cosmétique et culinaire.',
    badges: ['new'],
    variants: [{ label: 'Pot 500 g', packaging: 'pot', price: 2500 }],
  },
  // Hygiène & entretien
  {
    slug: 'savon-maison-claire',
    name: 'Savon de ménage',
    brand: 'Maison Claire',
    origin: 'local',
    category: 'hygiene-entretien',
    description: 'Savon de ménage multi-usage.',
    variants: [
      { label: 'Barre 400 g', packaging: 'barre', price: 350 },
      { label: 'Carton 36 barres', packaging: 'carton', price: 12500, isPro: true },
    ],
  },
  {
    slug: 'detergent-en-poudre',
    name: 'Détergent en poudre',
    brand: 'Maison Claire',
    origin: 'imported',
    category: 'hygiene-entretien',
    description: 'Lessive en poudre pour lavage à la main et en machine.',
    badges: ['promotion'],
    variants: [
      { label: 'Sachet 1 kg', packaging: 'sachet', price: 1100, compareAtPrice: 1300 },
      { label: 'Sac 15 kg', packaging: 'sac', price: 15000, isPro: true },
    ],
  },
];

function toVariant(slug: string, v: SeedVariant, index: number): Variant {
  return {
    id: `var_${slug}_${index}`,
    sku: `${slug.toUpperCase().slice(0, 12)}-${index}`,
    label: v.label,
    packaging: v.packaging,
    price: v.price,
    compareAtPrice: v.compareAtPrice ?? null,
    availability: v.availability ?? 'available',
    leadTimeDays: v.leadTimeDays ?? null,
    minQuantity: v.minQuantity ?? 1,
    isPro: v.isPro ?? false,
  };
}

function toDetail(seed: ProductSeed, index: number): ProductDetail {
  const category = findCategory(seed.category);
  if (!category) throw new Error(`Rayon mock inconnu : ${seed.category}`);
  const variants = seed.variants.map((v, i) => toVariant(seed.slug, v, i));
  return {
    id: `prd_${String(index + 1).padStart(4, '0')}`,
    slug: seed.slug,
    name: seed.name,
    brand: seed.brand,
    origin: seed.origin,
    imageUrl: null,
    badges: seed.badges ?? [],
    ...summarizeVariants(variants),
    priceRange: null,
    color: category.color,
    description: seed.description,
    categoryId: category.slug,
    images: [],
    variants,
    related: [],
  };
}

const details: ProductDetail[] = seeds.map(toDetail);

/** Graines brutes (prix, formats, stock) pour remplir la base du backend. */
export const productSeeds: readonly ProductSeed[] = seeds;

/** Identifiant stable d'une variante (partagé par le mock et la base). */
export function variantId(slug: string, index: number): string {
  return `var_${slug}_${index}`;
}

/** Stock limité par variante (simulé). Absent = non limité. */
export const mockStock: ReadonlyMap<string, number> = new Map(
  seeds.flatMap((s) =>
    s.variants.flatMap((v, i) => (v.stock !== undefined ? [[`var_${s.slug}_${i}`, v.stock] as const] : [])),
  ),
);

export { toSummary };

export const mockProducts: ProductDetail[] = details.map((p) => ({ ...p, related: relatedOf(details, p) }));

/** Rayons avec leur nombre de produits calculé. */
export function countByCategory(slug: string): number {
  return mockProducts.filter((p) => p.categoryId === slug).length;
}
