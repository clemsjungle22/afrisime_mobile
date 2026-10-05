import type { Availability, ProductDetail, ProductSummary, Variant } from '@afrisime/shared';

/**
 * Catalogue de démonstration inspiré du site AfriSime.
 * Prix et conditionnements FICTIFS : à remplacer par les données AfriGes.
 */

type Seed = {
  slug: string;
  name: string;
  brand: string;
  origin: 'local' | 'imported';
  categoryId: string;
  description: string;
  badges: ProductSummary['badges'];
  variants: Array<{
    label: string;
    packaging: string;
    price: number | null;
    compareAtPrice?: number;
    availability: Availability;
    leadTimeDays?: number;
    minQuantity?: number;
    isPro?: boolean;
  }>;
};

const seeds: Seed[] = [
  {
    slug: 'riz-parfume-savana',
    name: 'Riz parfumé Savana',
    brand: 'Savana',
    origin: 'imported',
    categoryId: 'epicerie',
    description: 'Riz long grain parfumé, idéal pour les plats du quotidien.',
    badges: ['popular', 'promotion'],
    variants: [
      { label: 'Sac 5 kg', packaging: 'sac', price: 4750, compareAtPrice: 4900, availability: 'available' },
      { label: 'Sac 25 kg', packaging: 'sac', price: 22500, availability: 'available' },
      { label: 'Sac 50 kg', packaging: 'sac', price: 43500, availability: 'available', isPro: true },
    ],
  },
  {
    slug: 'huile-vegetale-golfe-dor',
    name: "Huile végétale Golfe d'Or",
    brand: "Golfe d'Or",
    origin: 'local',
    categoryId: 'epicerie',
    description: 'Huile végétale raffinée pour la cuisson et la friture.',
    badges: ['popular'],
    variants: [
      { label: 'Bouteille 1 L', packaging: 'bouteille', price: 1400, availability: 'available' },
      { label: 'Bidon 5 L', packaging: 'bidon', price: 6500, availability: 'available' },
    ],
  },
  {
    slug: 'huile-aicha-25l',
    name: 'Huile Aïcha 25 L',
    brand: 'Aïcha',
    origin: 'imported',
    categoryId: 'epicerie',
    description: 'Format professionnel pour restaurants et revendeurs.',
    badges: ['b2b'],
    variants: [
      { label: 'Bidon 25 L', packaging: 'bidon', price: 29500, availability: 'available', isPro: true },
    ],
  },
  {
    slug: 'eau-minerale-aqua-lome',
    name: 'Eau minérale Aqua Lomé',
    brand: 'Aqua Lomé',
    origin: 'local',
    categoryId: 'boissons',
    description: 'Eau minérale naturelle embouteillée à Lomé.',
    badges: ['new'],
    variants: [
      { label: 'Bouteille 1,5 L', packaging: 'bouteille', price: 400, availability: 'available' },
      { label: 'Pack 6 × 1,5 L', packaging: 'pack', price: 2200, availability: 'available' },
    ],
  },
  {
    slug: 'gari-terroir-togo',
    name: 'Gari Terroir Togo',
    brand: 'Terroir Togo',
    origin: 'local',
    categoryId: 'produits-locaux',
    description: 'Gari de manioc produit au Togo.',
    badges: [],
    variants: [{ label: 'Sachet 2 kg', packaging: 'sachet', price: 1500, availability: 'available' }],
  },
  {
    slug: 'mais-terroir-togo',
    name: 'Maïs Terroir Togo',
    brand: 'Terroir Togo',
    origin: 'local',
    categoryId: 'produits-locaux',
    description: 'Maïs grain sec, récolte locale.',
    badges: [],
    variants: [{ label: 'Sac 25 kg', packaging: 'sac', price: 9000, availability: 'available' }],
  },
  {
    slug: 'savon-maison-claire',
    name: 'Savon Maison Claire',
    brand: 'Maison Claire',
    origin: 'local',
    categoryId: 'entretien',
    description: 'Savon de ménage multi-usage.',
    badges: [],
    variants: [
      { label: 'Morceau 400 g', packaging: 'unité', price: 350, availability: 'available' },
      { label: 'Carton 24 morceaux', packaging: 'carton', price: 7800, availability: 'available', isPro: true },
    ],
  },
  {
    slug: 'lait-en-poudre',
    name: 'Lait en poudre',
    brand: 'AfriSime Sélection',
    origin: 'imported',
    categoryId: 'epicerie',
    description: 'Lait entier en poudre, conditionnement grossiste sur devis.',
    badges: ['b2b'],
    variants: [
      { label: 'Sac 25 kg', packaging: 'sac', price: null, availability: 'quote_only', isPro: true },
    ],
  },
  {
    slug: 'cubes-assaisonnement',
    name: "Cubes d'assaisonnement",
    brand: 'AfriSime Sélection',
    origin: 'imported',
    categoryId: 'epicerie',
    description: 'Bouillon cube pour assaisonner sauces et ragoûts.',
    badges: ['out_of_stock'],
    variants: [{ label: 'Boîte 60 cubes', packaging: 'boîte', price: 1200, availability: 'unavailable' }],
  },
  {
    slug: 'huile-de-palme',
    name: 'Huile de palme',
    brand: 'Terroir Togo',
    origin: 'local',
    categoryId: 'produits-locaux',
    description: 'Huile de palme rouge artisanale, disponible sur commande.',
    badges: ['on_order'],
    variants: [
      { label: 'Bidon 5 L', packaging: 'bidon', price: 5500, availability: 'on_order', leadTimeDays: 3 },
    ],
  },
];

function toVariant(slug: string, v: Seed['variants'][number], index: number): Variant {
  return {
    id: `var_${slug}_${index}`,
    sku: `${slug.toUpperCase().slice(0, 12)}-${index}`,
    label: v.label,
    packaging: v.packaging,
    price: v.price,
    compareAtPrice: v.compareAtPrice ?? null,
    availability: v.availability,
    leadTimeDays: v.leadTimeDays ?? null,
    minQuantity: v.minQuantity ?? 1,
    isPro: v.isPro ?? false,
  };
}

function toDetail(seed: Seed, index: number): ProductDetail {
  const variants = seed.variants.map((v, i) => toVariant(seed.slug, v, i));
  const [defaultVariant] = variants;
  if (!defaultVariant) throw new Error(`Produit mock sans variante : ${seed.slug}`);
  const prices = variants.map((v) => v.price).filter((p): p is number => p !== null);
  const discount =
    defaultVariant.compareAtPrice && defaultVariant.price
      ? Math.round((1 - defaultVariant.price / defaultVariant.compareAtPrice) * 100)
      : null;
  return {
    id: `prd_${String(index + 1).padStart(4, '0')}`,
    slug: seed.slug,
    name: seed.name,
    brand: seed.brand,
    origin: seed.origin,
    imageUrl: null,
    badges: seed.badges,
    priceFrom: prices.length > 0 ? Math.min(...prices) : null,
    priceTo: prices.length > 0 ? Math.max(...prices) : null,
    discountPercent: discount,
    defaultVariant,
    variantsCount: variants.length,
    description: seed.description,
    categoryId: seed.categoryId,
    images: [],
    variants,
    relatedSlugs: [],
  };
}

export const mockProducts: ProductDetail[] = seeds.map(toDetail);

export function toSummary(p: ProductDetail): ProductSummary {
  const { description: _d, categoryId: _c, images: _i, variants: _v, relatedSlugs: _r, ...summary } = p;
  return summary;
}
