import { z } from 'zod';
import { Money } from './money';

/** Couleur hexadécimale #rrggbb, paramétrée côté back-office. */
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

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
  /** Couleur du rayon, utilisée pour la vignette quand il n'y a pas de photo. */
  color: HexColor,
});
export type ProductSummary = z.infer<typeof ProductSummary>;

export const ProductDetail = ProductSummary.extend({
  description: z.string(),
  categoryId: z.string(),
  images: z.array(z.string().url()),
  variants: z.array(Variant).min(1),
  /** « Souvent achetés avec » : résumés inclus pour éviter N requêtes. */
  related: z.array(ProductSummary),
});
export type ProductDetail = z.infer<typeof ProductDetail>;

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  /** Couleur du rayon (vignettes, tuiles). */
  color: string;
  productCount: number;
  children: Category[];
};

/** Arbre des rayons (récursif). */
export const Category: z.ZodType<Category> = z.lazy(() =>
  z.object({
    id: z.string(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().url().nullable(),
    color: HexColor,
    productCount: z.number().int().nonnegative(),
    children: z.array(Category),
  }),
);

export const ProductSort = z.enum(['relevance', 'popular', 'newest', 'price_asc', 'price_desc']);
export type ProductSort = z.infer<typeof ProductSort>;

/** Offres filtrables : promotions, nouveautés, formats pro (B2B). */
export const ProductOffer = z.enum(['promotion', 'new', 'pro']);
export type ProductOffer = z.infer<typeof ProductOffer>;

/** Paramètres de GET /v1/products (un filtre = une valeur au MVP). */
export const ProductListQuery = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  minPrice: Money.optional(),
  maxPrice: Money.optional(),
  availability: Availability.optional(),
  packaging: z.string().optional(),
  origin: ProductOrigin.optional(),
  offer: ProductOffer.optional(),
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
export type FacetValue = z.infer<typeof FacetValue>;

/**
 * Compteurs par filtre, calculés par le serveur. Chaque facette est comptée en appliquant
 * tous les AUTRES filtres actifs (on voit ce que donnerait chaque valeur).
 */
export const Facets = z.object({
  category: z.array(FacetValue),
  brand: z.array(FacetValue),
  availability: z.array(FacetValue),
  packaging: z.array(FacetValue),
  origin: z.array(FacetValue),
  offer: z.array(FacetValue),
});
export type Facets = z.infer<typeof Facets>;
export type FacetKey = keyof Facets;

export const PriceBounds = z.object({ min: Money, max: Money });
export type PriceBounds = z.infer<typeof PriceBounds>;

/** Réponse de GET /v1/products. */
export const ProductListResponse = z.object({
  items: z.array(ProductSummary),
  nextCursor: z.string().nullable(),
  /** Nombre total de résultats pour ces filtres (bouton « Voir N produits »). */
  total: z.number().int().nonnegative(),
  facets: Facets,
  /** Bornes de prix des résultats (hors filtre de prix), null si aucun prix. */
  priceBounds: PriceBounds.nullable(),
  /** Requête corrigée utilisée par le serveur si `q` semblait mal orthographiée. */
  correctedQuery: z.string().nullable(),
});
export type ProductListResponse = z.infer<typeof ProductListResponse>;
