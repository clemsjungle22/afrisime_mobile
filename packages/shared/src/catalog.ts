import { z } from 'zod';
import { Money } from './money';

/**
 * Les 4 états de disponibilité produit. Chacun a un rendu et une action distincts dans l'app :
 * available → ajouter au panier ; on_order → commander avec délai ;
 * unavailable → me prévenir ; quote_only → demander un devis.
 */
export const Availability = z.enum(['available', 'on_order', 'unavailable', 'quote_only']);
export type Availability = z.infer<typeof Availability>;

export const ProductOrigin = z.enum(['local', 'imported']);
export type ProductOrigin = z.infer<typeof ProductOrigin>;

export const ProductBadge = z.enum(['popular', 'promotion', 'new', 'b2b', 'out_of_stock', 'on_order']);
export type ProductBadge = z.infer<typeof ProductBadge>;

export const Variant = z.object({
  id: z.string(),
  sku: z.string(),
  /** Libellé affiché, ex. "Sac 5 kg" */
  label: z.string(),
  /** Type de conditionnement, ex. "sac" */
  packaging: z.string(),
  /** null si sur devis */
  price: Money.nullable(),
  compareAtPrice: Money.nullable(),
  availability: Availability,
  leadTimeDays: z.number().int().nonnegative().nullable(),
  minQuantity: z.number().int().positive().default(1),
  /** Format B2B (revendeurs, restaurants, PME) */
  isPro: z.boolean(),
});
export type Variant = z.infer<typeof Variant>;

export const ProductSummary = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  brand: z.string(),
  origin: ProductOrigin,
  imageUrl: z.string().url().nullable(),
  badges: z.array(ProductBadge),
  priceFrom: Money.nullable(),
  priceTo: Money.nullable(),
  discountPercent: z.number().int().min(0).max(100).nullable(),
  defaultVariant: Variant,
  variantsCount: z.number().int().positive(),
});
export type ProductSummary = z.infer<typeof ProductSummary>;

export const ProductDetail = ProductSummary.extend({
  description: z.string(),
  categoryId: z.string(),
  images: z.array(z.string().url()),
  variants: z.array(Variant).min(1),
  relatedSlugs: z.array(z.string()),
});
export type ProductDetail = z.infer<typeof ProductDetail>;

export type Category = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  children: Category[];
};

/** Arbre des rayons (récursif). */
export const Category: z.ZodType<Category> = z.lazy(() =>
  z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    imageUrl: z.string().url().nullable(),
    children: z.array(Category),
  }),
);

export const ProductSort = z.enum(['relevance', 'price_asc', 'price_desc', 'newest', 'popular']);
export type ProductSort = z.infer<typeof ProductSort>;

/** Paramètres de GET /v1/products */
export const ProductListQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: Money.optional(),
  maxPrice: Money.optional(),
  availability: Availability.optional(),
  packaging: z.string().optional(),
  origin: ProductOrigin.optional(),
  offer: z.boolean().optional(),
  sort: ProductSort.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export type ProductListQuery = z.infer<typeof ProductListQuery>;

export const FacetValue = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
});

export const Facets = z.record(z.string(), z.array(FacetValue));
export type Facets = z.infer<typeof Facets>;
