import {
  MAX_LINE_QUANTITY,
  type Category,
  type HomeBanner,
  type ProductDetail,
  type Variant,
  relatedOf,
  summarizeVariants,
} from '@afrisime/shared';
import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { computeAvailability } from './availability';

/**
 * Catalogue tel que l'app le voit, assemblé depuis la base pour un segment tarifaire :
 * seuls les rayons, produits et formats actifs ; prix en vigueur ; disponibilité calculée.
 */
export type CatalogSnapshot = {
  segment: string;
  products: ProductDetail[];
  bySlug: Map<string, ProductDetail>;
  /**
   * Quantité commandable des formats dont le stock limite la commande (sous MAX_LINE_QUANTITY).
   * Usage interne (revalidation du panier) : la quantité n'est révélée qu'au moment où elle plafonne une ligne.
   */
  stockLimits: Map<string, number>;
  categories: Category[];
  banners: HomeBanner[];
  /** Fin des ventes flash : fin du prix promo le plus proche, sinon fin de journée (Lomé = UTC). */
  flashEndsAt: string;
};

export type PriceRow = {
  variantId: string;
  segment: string;
  amount: number;
  compareAtAmount: number | null;
  validFrom: Date;
  validTo: Date | null;
};

/**
 * Prix applicable parmi les prix en vigueur, dans cet ordre :
 * 1. le segment du client avant le prix public ;
 * 2. un prix temporaire (promo, avec date de fin) avant le prix permanent ;
 * 3. le plus récent.
 */
export function pickPrices(rows: PriceRow[], segment: string): Map<string, PriceRow> {
  const best = new Map<string, PriceRow>();
  const score = (r: PriceRow) => [
    r.segment === segment ? 1 : 0,
    r.validTo ? 1 : 0,
    r.validFrom.getTime(),
  ];
  const better = (a: PriceRow, b: PriceRow) => {
    const [x, y] = [score(a), score(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
    return false;
  };
  for (const r of rows) {
    const current = best.get(r.variantId);
    if (!current || better(r, current)) best.set(r.variantId, r);
  }
  return best;
}

const COMPUTED_BADGES = new Set(['promotion', 'out_of_stock', 'on_order']);

/**
 * Badges affichés : ceux choisis par l'équipe (populaire, nouveau, pro) + ceux calculés ici
 * à partir des prix et du stock (promo en cours, rupture, sur commande) — jamais en décalage.
 */
function badgesOf(editorial: string[], variants: Variant[]): ProductDetail['badges'] {
  const badges = editorial.filter((b) => !COMPUTED_BADGES.has(b)) as ProductDetail['badges'];
  if (variants.some((v) => v.compareAtPrice !== null)) badges.push('promotion');
  if (variants.every((v) => v.availability === 'unavailable')) badges.push('out_of_stock');
  else if (variants.some((v) => v.availability === 'on_order')) badges.push('on_order');
  return badges;
}

function endOfDayUtc(now: Date): Date {
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 0);
  return end;
}

export async function loadCatalog(
  db: Db,
  options: { segment?: string; now?: Date } = {},
): Promise<CatalogSnapshot> {
  const segment = options.segment ?? 'retail';
  const now = options.now ?? new Date();

  const [categoryRows, productRows, variantRows, priceRows, stockRows, bannerRows] =
    await Promise.all([
      db
        .select()
        .from(s.categories)
        .where(eq(s.categories.isActive, true))
        .orderBy(asc(s.categories.sortOrder), asc(s.categories.name)),
      db
        .select()
        .from(s.products)
        .where(eq(s.products.isActive, true))
        .orderBy(asc(s.products.sortOrder), asc(s.products.name)),
      db
        .select()
        .from(s.productVariants)
        .where(eq(s.productVariants.isActive, true))
        .orderBy(asc(s.productVariants.productId), asc(s.productVariants.sortOrder)),
      db
        .select({
          variantId: s.prices.variantId,
          segment: s.prices.segment,
          amount: s.prices.amount,
          compareAtAmount: s.prices.compareAtAmount,
          validFrom: s.prices.validFrom,
          validTo: s.prices.validTo,
        })
        .from(s.prices)
        .where(
          and(
            isNull(s.prices.agencyId),
            or(eq(s.prices.segment, segment), eq(s.prices.segment, 'retail')),
            lte(s.prices.validFrom, now),
            or(isNull(s.prices.validTo), gt(s.prices.validTo, now)),
          ),
        ),
      db
        .select({
          variantId: s.stockLevels.variantId,
          sellable: sql<number>`sum(${s.stockLevels.onHand} - ${s.stockLevels.reserved})::int`,
        })
        .from(s.stockLevels)
        .innerJoin(s.agencies, eq(s.agencies.id, s.stockLevels.agencyId))
        .where(eq(s.agencies.isActive, true))
        .groupBy(s.stockLevels.variantId),
      db
        .select()
        .from(s.homeBanners)
        .where(
          and(
            eq(s.homeBanners.isActive, true),
            or(isNull(s.homeBanners.startsAt), lte(s.homeBanners.startsAt, now)),
            or(isNull(s.homeBanners.endsAt), gt(s.homeBanners.endsAt, now)),
          ),
        )
        .orderBy(asc(s.homeBanners.sortOrder)),
    ]);

  const prices = pickPrices(priceRows, segment);
  const sellable = new Map(stockRows.map((r) => [r.variantId, Number(r.sellable)]));
  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));

  const variantsByProduct = new Map<string, Variant[]>();
  const stockLimits = new Map<string, number>();
  for (const v of variantRows) {
    const price = prices.get(v.id);
    // Un format vendu au prix catalogue sans prix en vigueur ne peut pas être vendu : il est masqué.
    if (v.saleMode !== 'quote_only' && !price) continue;
    const variant: Variant = {
      id: v.id,
      sku: v.sku,
      label: v.label,
      packaging: v.packaging,
      price: v.saleMode === 'quote_only' ? null : price!.amount,
      compareAtPrice: v.saleMode === 'quote_only' ? null : (price!.compareAtAmount ?? null),
      availability: computeAvailability(v.saleMode, sellable.get(v.id) ?? 0, 0),
      leadTimeDays: v.leadTimeDays,
      minQuantity: v.minQuantity,
      isPro: v.isPro,
    };
    const stock = sellable.get(v.id) ?? 0;
    if (v.saleMode === 'standard' && stock > 0 && stock < MAX_LINE_QUANTITY)
      stockLimits.set(v.id, stock);
    const list = variantsByProduct.get(v.productId) ?? [];
    list.push(variant);
    variantsByProduct.set(v.productId, list);
  }

  const details: ProductDetail[] = [];
  for (const p of productRows) {
    const category = categoryById.get(p.categoryId);
    const variants = variantsByProduct.get(p.id);
    if (!category || !variants?.length) continue; // rayon désactivé ou aucun format vendable
    details.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      origin: p.origin,
      imageUrl: p.imageUrl,
      badges: badgesOf(p.badges, variants),
      ...summarizeVariants(variants),
      color: category.color,
      description: p.description,
      categoryId: category.slug,
      images: p.imageUrl ? [p.imageUrl] : [],
      variants,
      related: [],
    });
  }
  const products = details.map((p) => ({ ...p, related: relatedOf(details, p) }));

  const counts = new Map<string, number>();
  for (const p of products) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);

  const categories: Category[] = categoryRows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    imageUrl: c.imageUrl,
    color: c.color,
    productCount: counts.get(c.slug) ?? 0,
    children: [],
  }));

  const promoEnds = priceRows
    .filter((r) => r.compareAtAmount !== null && r.validTo !== null)
    .map((r) => r.validTo!.getTime());
  const flashEndsAt = new Date(
    promoEnds.length > 0 ? Math.min(...promoEnds) : endOfDayUtc(now).getTime(),
  ).toISOString();

  return {
    segment,
    products,
    bySlug: new Map(products.map((p) => [p.slug, p])),
    stockLimits,
    categories,
    banners: bannerRows.map((b) => ({
      id: b.id,
      eyebrow: b.eyebrow,
      title: b.title,
      subtitle: b.subtitle,
      imageUrl: b.imageUrl,
      ctaLabel: b.ctaLabel,
      link: b.link,
      tone: b.tone,
    })),
    flashEndsAt,
  };
}
