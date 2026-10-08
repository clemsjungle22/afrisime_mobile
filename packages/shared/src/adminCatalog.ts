import { z } from 'zod';
import { Availability, HexColor, MediaUrl, ProductOrigin } from './catalog';
import { Money } from './money';

/**
 * Contrat du back-office pour le catalogue (/v1/admin/catalog).
 * Les badges « promo », « rupture » et « sur commande » sont calculés par le serveur ;
 * l'équipe choisit seulement les badges éditoriaux.
 */

export const EditorialBadge = z.enum(['popular', 'new', 'b2b']);
export type EditorialBadge = z.infer<typeof EditorialBadge>;

export const EDITORIAL_BADGE_LABELS: Record<EditorialBadge, string> = {
  popular: 'Populaire',
  new: 'Nouveau',
  b2b: 'Pro',
};

export const SaleMode = z.enum(['standard', 'on_order', 'quote_only']);
export type SaleMode = z.infer<typeof SaleMode>;

export const SALE_MODE_LABELS: Record<SaleMode, string> = {
  standard: 'En stock',
  on_order: 'Sur commande',
  quote_only: 'Sur devis',
};

/** Teintes proposées pour un rayon (palette du site). */
export const CATEGORY_COLORS = [
  '#2e7d5b',
  '#1f6f8b',
  '#b7862b',
  '#c2791b',
  '#4f8a2b',
  '#6b5ca5',
  '#a8432f',
  '#0f3d2e',
] as const;

const Name = z.string().trim().min(2, 'Au moins 2 caractères').max(80);

// ─── Rayons ──────────────────────────────────────────────────────────────────

export const AdminCategory = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: HexColor,
  /** Photo du rayon (sinon : couleur). */
  imageUrl: MediaUrl.nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  productCount: z.number().int().nonnegative(),
});
export type AdminCategory = z.infer<typeof AdminCategory>;

export const AdminCategoryInput = z.object({
  name: Name,
  description: z.string().trim().max(300).nullable(),
  color: HexColor,
  isActive: z.boolean(),
});
export type AdminCategoryInput = z.infer<typeof AdminCategoryInput>;

export const AdminCategoryMoveBody = z.object({ direction: z.enum(['up', 'down']) });

// ─── Produits et formats ─────────────────────────────────────────────────────

export const AdminProductListQuery = z.object({
  q: z.string().trim().max(80).optional(),
  categoryId: z.string().optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  /** Seulement les produits dont un format est en rupture ou sous son seuil. */
  lowStock: z.enum(['1']).optional(),
  cursor: z.string().optional(),
});
export type AdminProductListQuery = z.infer<typeof AdminProductListQuery>;

export const AdminProductRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  brand: z.string(),
  origin: ProductOrigin,
  category: z.object({ id: z.string(), name: z.string(), color: HexColor }),
  /** Photo du produit (sinon : initiales). */
  imageUrl: MediaUrl.nullable(),
  isActive: z.boolean(),
  variantsCount: z.number().int().nonnegative(),
  /** Prix publics en vigueur (null : sur devis ou sans prix). */
  priceFrom: Money.nullable(),
  priceTo: Money.nullable(),
  onPromotion: z.boolean(),
  /** Stock vendable total (formats « en stock » uniquement). */
  sellable: z.number().int(),
  /** Au moins un format « en stock » (sinon : sur commande ou sur devis, pas de stock suivi). */
  tracksStock: z.boolean(),
  lowStock: z.boolean(),
  badges: z.array(EditorialBadge),
});
export type AdminProductRow = z.infer<typeof AdminProductRow>;

export const AdminProductList = z.object({
  items: z.array(AdminProductRow),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});
export type AdminProductList = z.infer<typeof AdminProductList>;

export const AdminVariantInput = z
  .object({
    label: z.string().trim().min(1, 'Indiquez le format (ex. Sac 25 kg)').max(60),
    packaging: z.string().trim().min(1, 'Indiquez le conditionnement (ex. sac)').max(30),
    saleMode: SaleMode,
    leadTimeDays: z.number().int().min(1).max(60).nullable(),
    minQuantity: z.number().int().min(1).max(999),
    isPro: z.boolean(),
    isActive: z.boolean(),
  })
  .refine((v) => v.saleMode !== 'on_order' || v.leadTimeDays !== null, {
    message: 'Indiquez le délai (en jours) d’un format sur commande',
    path: ['leadTimeDays'],
  });
export type AdminVariantInput = z.infer<typeof AdminVariantInput>;

export const AdminProductInput = z.object({
  name: Name,
  brand: z.string().trim().min(1, 'Indiquez la marque').max(60),
  origin: ProductOrigin,
  categoryId: z.string().min(1, 'Choisissez un rayon'),
  description: z.string().trim().max(1000),
  badges: z.array(EditorialBadge).max(3),
  isActive: z.boolean(),
});
export type AdminProductInput = z.infer<typeof AdminProductInput>;

/** Format créé avec son prix public et son stock de départ. */
export const AdminNewVariant = z
  .object({
    variant: AdminVariantInput,
    /** Prix public (obligatoire sauf « sur devis »). */
    price: Money.positive().nullable(),
    initialStock: z.array(
      z.object({ agencyId: z.string(), quantity: z.number().int().min(0).max(1_000_000) }),
    ),
  })
  .refine((v) => v.variant.saleMode === 'quote_only' || v.price !== null, {
    message: 'Indiquez le prix public',
    path: ['price'],
  });
export type AdminNewVariant = z.infer<typeof AdminNewVariant>;

export const AdminProductCreate = z.object({ product: AdminProductInput, first: AdminNewVariant });
export type AdminProductCreate = z.infer<typeof AdminProductCreate>;

// ─── Prix ────────────────────────────────────────────────────────────────────

export const PriceState = z.enum(['current', 'scheduled', 'expired', 'replaced']);
export type PriceState = z.infer<typeof PriceState>;

export const AdminPrice = z.object({
  id: z.number().int(),
  segment: z.enum(['retail', 'pro']),
  kind: z.enum(['base', 'promo']),
  amount: Money,
  compareAtAmount: Money.nullable(),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime().nullable(),
  state: PriceState,
  createdAt: z.string().datetime(),
});
export type AdminPrice = z.infer<typeof AdminPrice>;

/** Nouveau prix public ou pro, immédiat ou à partir d'une date. */
export const AdminPriceBody = z.object({
  segment: z.enum(['retail', 'pro']),
  amount: Money.positive('Le prix doit être supérieur à 0'),
  /** Absent : immédiatement. */
  validFrom: z.string().datetime().optional(),
});
export type AdminPriceBody = z.infer<typeof AdminPriceBody>;

export const AdminPromoBody = z
  .object({
    amount: Money.positive(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((p) => Date.parse(p.endsAt) > Date.parse(p.startsAt), {
    message: 'La fin doit être après le début',
    path: ['endsAt'],
  });
export type AdminPromoBody = z.infer<typeof AdminPromoBody>;

// ─── Stock ───────────────────────────────────────────────────────────────────

export const StockReason = z.enum([
  'reception',
  'inventory',
  'loss',
  'return',
  'correction',
  'sale',
  'initial',
]);
export type StockReason = z.infer<typeof StockReason>;

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  reception: 'Réception',
  inventory: 'Inventaire',
  loss: 'Casse / perte',
  return: 'Retour',
  correction: 'Correction',
  sale: 'Vente',
  initial: 'Stock initial',
};

export const AdminStockLevel = z.object({
  agencyId: z.string(),
  agencyName: z.string(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  sellable: z.number().int(),
  lowThreshold: z.number().int().nonnegative(),
});
export type AdminStockLevel = z.infer<typeof AdminStockLevel>;

/**
 * Mouvement de stock : ajouter (réception, retour), retirer (casse, correction)
 * ou fixer le stock compté (inventaire).
 */
export const AdminStockBody = z
  .object({
    agencyId: z.string(),
    kind: z.enum(['add', 'remove', 'set']),
    quantity: z.number().int().min(0).max(1_000_000),
    reason: StockReason.exclude(['sale', 'initial']),
    note: z.string().trim().max(200).optional(),
  })
  .refine((b) => b.kind === 'set' || b.quantity > 0, {
    message: 'Quantité supérieure à 0',
    path: ['quantity'],
  });
export type AdminStockBody = z.infer<typeof AdminStockBody>;

export const AdminThresholdBody = z.object({
  agencyId: z.string(),
  lowThreshold: z.number().int().min(0).max(100_000),
});

export const AdminStockMovement = z.object({
  id: z.number().int(),
  agencyName: z.string(),
  delta: z.number().int(),
  onHandAfter: z.number().int(),
  reason: StockReason,
  note: z.string().nullable(),
  /** Membre de l'équipe, ou numéro de commande pour une vente. */
  actor: z.string(),
  at: z.string().datetime(),
});
export type AdminStockMovement = z.infer<typeof AdminStockMovement>;

// ─── Fiche produit ───────────────────────────────────────────────────────────

export const AdminVariant = z.object({
  id: z.string(),
  sku: z.string(),
  label: z.string(),
  packaging: z.string(),
  saleMode: SaleMode,
  leadTimeDays: z.number().int().nullable(),
  minQuantity: z.number().int(),
  isPro: z.boolean(),
  isActive: z.boolean(),
  /** Disponibilité affichée aux clients (prix public). */
  availability: Availability,
  current: z.object({
    retail: Money.nullable(),
    pro: Money.nullable(),
    promo: z
      .object({
        id: z.number().int(),
        amount: Money,
        compareAt: Money,
        endsAt: z.string().datetime().nullable(),
      })
      .nullable(),
  }),
  prices: z.array(AdminPrice),
  stock: z.array(AdminStockLevel),
});
export type AdminVariant = z.infer<typeof AdminVariant>;

export const AdminProductDetail = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  brand: z.string(),
  origin: ProductOrigin,
  imageUrl: MediaUrl.nullable(),
  categoryId: z.string(),
  description: z.string(),
  badges: z.array(EditorialBadge),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  variants: z.array(AdminVariant),
});
export type AdminProductDetail = z.infer<typeof AdminProductDetail>;

/** Règles des photos envoyées depuis le back-office (vérifiées par le serveur). */
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
