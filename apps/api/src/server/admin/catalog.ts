import {
  type AdminCategory,
  type AdminCategoryInput,
  type AdminNewVariant,
  type AdminPrice,
  type AdminPriceBody,
  type AdminProductCreate,
  type AdminProductDetail,
  type AdminProductInput,
  type AdminProductList,
  type AdminProductListQuery,
  type AdminProductRow,
  type AdminPromoBody,
  type AdminRole,
  type AdminStockBody,
  type AdminStockMovement,
  type AdminVariant,
  type AdminVariantInput,
  type EditorialBadge,
  EditorialBadge as EditorialBadgeSchema,
  type StockReason,
  normalize,
} from '@afrisime/shared';
import {
  type SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { computeAvailability } from '../catalog/availability';
import { type PriceRow, pickPrices } from '../catalog/repository';
import { decodeCursor, encodeCursor, invalidateCatalog } from '../catalog/service';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { removeImage, storeImage } from '../media';
import { type AdminContext, adminAudit } from './auth';

/** Tout le monde consulte le catalogue (le service client répond sur le stock) ; seuls Catalogue et Admin modifient. */
export const CATALOG_VIEW_ROLES: readonly AdminRole[] = [
  'admin',
  'catalog',
  'orders',
  'support',
  'readonly',
];
export const CATALOG_EDIT_ROLES: readonly AdminRole[] = ['admin', 'catalog'];

const PAGE = 50;
type Tx = Db;
type VariantRow = typeof s.productVariants.$inferSelect;

const notFound = (what: string) => new ApiError('NOT_FOUND', `${what} introuvable.`);
const invalid = (message: string, field?: string) =>
  new ApiError('VALIDATION_ERROR', message, field ? { field } : undefined, 422);

/** « Huile d'arachide 1 L » → « huile-d-arachide-1-l » */
const slugify = (text: string) => normalize(text).replace(/\s+/g, '-').slice(0, 60) || 'produit';

/** Identifiant lisible unique (slug ou SKU) : suffixe -2, -3… si déjà pris. */
async function unique(
  taken: (candidate: string) => Promise<boolean>,
  base: string,
): Promise<string> {
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }
  return `${base}-${newId('x').slice(-6)}`;
}

/** Écriture + audit + catalogue de l'app rafraîchi, dans une transaction. */
async function write<T>(db: Db, run: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await db.transaction((txn) => run(txn as unknown as Tx));
  invalidateCatalog();
  return result;
}

const audit = (
  tx: Tx,
  ctx: AdminContext,
  action: string,
  entity: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
) => adminAudit(tx, { actorId: ctx.admin.id, action, entity, entityId, before, after });

// ─── Rayons ──────────────────────────────────────────────────────────────────

export async function listCategories(db: Db): Promise<AdminCategory[]> {
  const [rows, counts] = await Promise.all([
    db.select().from(s.categories).orderBy(asc(s.categories.sortOrder), asc(s.categories.name)),
    db
      .select({ categoryId: s.products.categoryId, n: count() })
      .from(s.products)
      .groupBy(s.products.categoryId),
  ]);
  const byCategory = new Map(counts.map((c) => [c.categoryId, c.n]));
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    color: c.color,
    imageUrl: c.imageUrl,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    productCount: byCategory.get(c.id) ?? 0,
  }));
}

export async function createCategory(db: Db, ctx: AdminContext, input: AdminCategoryInput) {
  await write(db, async (tx) => {
    const slug = await unique(
      async (c) => (await tx.$count(s.categories, eq(s.categories.slug, c))) > 0,
      slugify(input.name),
    );
    const [last] = await tx
      .select({ max: sql<number>`coalesce(max(${s.categories.sortOrder}), -1)::int` })
      .from(s.categories);
    const id = newId('cat');
    await tx.insert(s.categories).values({ id, slug, ...input, sortOrder: (last?.max ?? -1) + 1 });
    await audit(tx, ctx, 'category.created', 'category', id, null, input);
  });
  return listCategories(db);
}

export async function updateCategory(
  db: Db,
  ctx: AdminContext,
  id: string,
  input: AdminCategoryInput,
) {
  await write(db, async (tx) => {
    const [before] = await tx.select().from(s.categories).where(eq(s.categories.id, id));
    if (!before) throw notFound('Rayon');
    await tx
      .update(s.categories)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(s.categories.id, id));
    await audit(tx, ctx, 'category.updated', 'category', id, before, input);
  });
  return listCategories(db);
}

/** Monte ou descend un rayon d'un cran dans l'ordre d'affichage de l'app. */
export async function moveCategory(
  db: Db,
  ctx: AdminContext,
  id: string,
  direction: 'up' | 'down',
) {
  await write(db, async (tx) => {
    const rows = await tx
      .select()
      .from(s.categories)
      .orderBy(asc(s.categories.sortOrder), asc(s.categories.name));
    const index = rows.findIndex((c) => c.id === id);
    if (index < 0) throw notFound('Rayon');
    const other = rows[direction === 'up' ? index - 1 : index + 1];
    if (!other) return;
    // Ordre normalisé (0, 1, 2…) puis échange des deux voisins.
    const order = rows.map((c) => c.id);
    [order[index], order[direction === 'up' ? index - 1 : index + 1]] = [other.id, id];
    for (const [i, catId] of order.entries()) {
      await tx.update(s.categories).set({ sortOrder: i }).where(eq(s.categories.id, catId));
    }
    await audit(tx, ctx, 'category.moved', 'category', id, null, { direction });
  });
  return listCategories(db);
}

// ─── Prix : lecture ──────────────────────────────────────────────────────────

function priceState(
  p: typeof s.prices.$inferSelect,
  current: Set<number>,
  now: Date,
): AdminPrice['state'] {
  if (current.has(p.id)) return 'current';
  if (p.validFrom > now) return 'scheduled';
  if (p.validTo && p.validTo <= now) return 'expired';
  return 'replaced';
}

/** Prix en vigueur d'un format pour un segment (même règle que le catalogue de l'app). */
function currentFor(
  rows: (typeof s.prices.$inferSelect)[],
  variantId: string,
  segment: string,
  now: Date,
) {
  const live = rows.filter(
    (p) =>
      p.variantId === variantId &&
      p.agencyId === null &&
      (p.segment === segment || p.segment === 'retail') &&
      p.validFrom <= now &&
      (p.validTo === null || p.validTo > now),
  ) as (PriceRow & { id: number })[];
  return pickPrices(live, segment).get(variantId) as (PriceRow & { id: number }) | undefined;
}

// ─── Produits : liste ────────────────────────────────────────────────────────

export async function listProducts(
  db: Db,
  query: AdminProductListQuery,
  now = new Date(),
): Promise<AdminProductList> {
  const filters: (SQL | undefined)[] = [
    query.categoryId ? eq(s.products.categoryId, query.categoryId) : undefined,
    query.status === 'active'
      ? eq(s.products.isActive, true)
      : query.status === 'inactive'
        ? eq(s.products.isActive, false)
        : undefined,
    query.q
      ? or(
          ilike(s.products.name, `%${query.q}%`),
          ilike(s.products.brand, `%${query.q}%`),
          ilike(s.products.slug, `%${slugify(query.q)}%`),
        )
      : undefined,
  ];
  const products = await db
    .select({ product: s.products, category: s.categories })
    .from(s.products)
    .innerJoin(s.categories, eq(s.categories.id, s.products.categoryId))
    .where(and(...filters))
    .orderBy(asc(s.categories.sortOrder), asc(s.products.sortOrder), asc(s.products.name));

  const ids = products.map((p) => p.product.id);
  const [variants, prices, stock] = ids.length
    ? await Promise.all([
        db.select().from(s.productVariants).where(inArray(s.productVariants.productId, ids)),
        db
          .select()
          .from(s.prices)
          .innerJoin(s.productVariants, eq(s.productVariants.id, s.prices.variantId))
          .where(
            and(
              inArray(s.productVariants.productId, ids),
              lte(s.prices.validFrom, now),
              or(isNull(s.prices.validTo), gt(s.prices.validTo, now)),
            ),
          ),
        db
          .select({
            variantId: s.stockLevels.variantId,
            sellable: sql<number>`sum(${s.stockLevels.onHand} - ${s.stockLevels.reserved})::int`,
            threshold: sql<number>`max(${s.stockLevels.lowThreshold})::int`,
          })
          .from(s.stockLevels)
          .innerJoin(s.productVariants, eq(s.productVariants.id, s.stockLevels.variantId))
          .where(inArray(s.productVariants.productId, ids))
          .groupBy(s.stockLevels.variantId),
      ])
    : [[], [], []];
  const priceRows = prices.map((r) => r.prices);
  const stockBy = new Map(
    stock.map((r) => [
      r.variantId,
      { sellable: Number(r.sellable), threshold: Number(r.threshold) },
    ]),
  );

  let rows: AdminProductRow[] = products.map(({ product: p, category: c }) => {
    const own = variants.filter((v) => v.productId === p.id && v.isActive);
    const retail = own
      .filter((v) => v.saleMode !== 'quote_only')
      .map((v) => currentFor(priceRows, v.id, 'retail', now))
      .filter((x): x is PriceRow & { id: number } => x !== undefined);
    const standard = own.filter((v) => v.saleMode === 'standard');
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      origin: p.origin,
      category: { id: c.id, name: c.name, color: c.color },
      imageUrl: p.imageUrl,
      isActive: p.isActive,
      variantsCount: own.length,
      priceFrom: retail.length ? Math.min(...retail.map((x) => x.amount)) : null,
      priceTo: retail.length ? Math.max(...retail.map((x) => x.amount)) : null,
      onPromotion: retail.some((x) => x.compareAtAmount !== null),
      sellable: standard.reduce((n, v) => n + (stockBy.get(v.id)?.sellable ?? 0), 0),
      tracksStock: standard.length > 0,
      lowStock: standard.some((v) => {
        const st = stockBy.get(v.id);
        return !st || st.sellable <= st.threshold;
      }),
      badges: p.badges.filter(
        (b): b is EditorialBadge => EditorialBadgeSchema.safeParse(b).success,
      ),
    };
  });
  if (query.lowStock) rows = rows.filter((r) => r.lowStock);

  const start = decodeCursor(query.cursor);
  return {
    items: rows.slice(start, start + PAGE),
    nextCursor: start + PAGE < rows.length ? encodeCursor(start + PAGE) : null,
    total: rows.length,
  };
}

// ─── Produit : fiche ─────────────────────────────────────────────────────────

export async function getProduct(
  db: Db,
  productId: string,
  now = new Date(),
): Promise<AdminProductDetail> {
  const [p] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!p) throw notFound('Produit');
  const variants = await db
    .select()
    .from(s.productVariants)
    .where(eq(s.productVariants.productId, p.id))
    .orderBy(asc(s.productVariants.sortOrder), asc(s.productVariants.createdAt));
  const variantIds = variants.map((v) => v.id);
  const [prices, levels, agencies] = await Promise.all([
    variantIds.length
      ? db
          .select()
          .from(s.prices)
          .where(inArray(s.prices.variantId, variantIds))
          .orderBy(desc(s.prices.validFrom), desc(s.prices.id))
      : Promise.resolve([]),
    variantIds.length
      ? db.select().from(s.stockLevels).where(inArray(s.stockLevels.variantId, variantIds))
      : Promise.resolve([]),
    db.select().from(s.agencies).orderBy(asc(s.agencies.sortOrder)),
  ]);

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    origin: p.origin,
    imageUrl: p.imageUrl,
    categoryId: p.categoryId,
    description: p.description,
    badges: p.badges.filter((b): b is EditorialBadge => EditorialBadgeSchema.safeParse(b).success),
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    variants: variants.map((v) => toAdminVariant(v, prices, levels, agencies, now)),
  };
}

function toAdminVariant(
  v: VariantRow,
  allPrices: (typeof s.prices.$inferSelect)[],
  allLevels: (typeof s.stockLevels.$inferSelect)[],
  agencies: (typeof s.agencies.$inferSelect)[],
  now: Date,
): AdminVariant {
  const prices = allPrices.filter((p) => p.variantId === v.id && p.agencyId === null);
  const retail = currentFor(prices, v.id, 'retail', now);
  const proRaw = currentFor(prices, v.id, 'pro', now);
  const pro = proRaw && proRaw.segment === 'pro' ? proRaw : undefined;
  const currentIds = new Set([retail?.id, pro?.id].filter((x): x is number => x !== undefined));
  const stock = agencies
    .filter((a) => a.isActive || allLevels.some((l) => l.variantId === v.id && l.agencyId === a.id))
    .map((a) => {
      const l = allLevels.find((x) => x.variantId === v.id && x.agencyId === a.id);
      const onHand = l?.onHand ?? 0;
      const reserved = l?.reserved ?? 0;
      return {
        agencyId: a.id,
        agencyName: a.name,
        onHand,
        reserved,
        sellable: onHand - reserved,
        lowThreshold: l?.lowThreshold ?? 0,
      };
    });
  const sellable = stock
    .filter((st) => agencies.find((a) => a.id === st.agencyId)?.isActive)
    .reduce((n, st) => n + st.sellable, 0);

  return {
    id: v.id,
    sku: v.sku,
    label: v.label,
    packaging: v.packaging,
    saleMode: v.saleMode,
    leadTimeDays: v.leadTimeDays,
    minQuantity: v.minQuantity,
    isPro: v.isPro,
    isActive: v.isActive,
    availability: computeAvailability(v.saleMode, sellable, 0),
    current: {
      retail: v.saleMode === 'quote_only' ? null : (retail?.amount ?? null),
      pro: v.saleMode === 'quote_only' ? null : (pro?.amount ?? null),
      promo:
        retail && retail.compareAtAmount !== null
          ? {
              id: retail.id,
              amount: retail.amount,
              compareAt: retail.compareAtAmount,
              endsAt: retail.validTo?.toISOString() ?? null,
            }
          : null,
    },
    prices: prices.slice(0, 30).map((p) => ({
      id: p.id,
      segment: p.segment === 'pro' ? 'pro' : 'retail',
      kind: p.compareAtAmount !== null ? 'promo' : 'base',
      amount: p.amount,
      compareAtAmount: p.compareAtAmount,
      validFrom: p.validFrom.toISOString(),
      validTo: p.validTo?.toISOString() ?? null,
      state: priceState(p, currentIds, now),
      createdAt: p.createdAt.toISOString(),
    })),
    stock,
  };
}

// ─── Produit : écriture ──────────────────────────────────────────────────────

async function ensureCategory(tx: Tx, categoryId: string) {
  const [c] = await tx
    .select({ id: s.categories.id })
    .from(s.categories)
    .where(eq(s.categories.id, categoryId));
  if (!c) throw invalid('Rayon inconnu.', 'categoryId');
}

async function insertVariant(
  tx: Tx,
  ctx: AdminContext,
  productId: string,
  productSlug: string,
  input: AdminNewVariant,
  sortOrder: number,
  now: Date,
) {
  const v = input.variant;
  const id = newId('var');
  const sku = await unique(
    async (c) => (await tx.$count(s.productVariants, eq(s.productVariants.sku, c))) > 0,
    `${productSlug.toUpperCase().replace(/-/g, '').slice(0, 10)}-${slugify(v.label).toUpperCase().replace(/-/g, '').slice(0, 8)}`,
  );
  await tx.insert(s.productVariants).values({
    id,
    productId,
    sku,
    label: v.label,
    packaging: v.packaging.toLowerCase(),
    saleMode: v.saleMode,
    leadTimeDays: v.saleMode === 'on_order' ? v.leadTimeDays : null,
    minQuantity: v.minQuantity,
    isPro: v.isPro,
    isActive: v.isActive,
    sortOrder,
  });
  if (v.saleMode !== 'quote_only' && input.price !== null) {
    await tx.insert(s.prices).values({
      variantId: id,
      segment: 'retail',
      amount: input.price,
      validFrom: now,
      createdAt: now,
    });
  }
  const agencies = await tx.select({ id: s.agencies.id }).from(s.agencies);
  for (const a of agencies) {
    const quantity = input.initialStock.find((x) => x.agencyId === a.id)?.quantity ?? 0;
    await tx
      .insert(s.stockLevels)
      .values({ variantId: id, agencyId: a.id, onHand: quantity, reserved: 0, lowThreshold: 0 });
    if (quantity > 0) {
      await tx.insert(s.stockMovements).values({
        variantId: id,
        agencyId: a.id,
        delta: quantity,
        onHandAfter: quantity,
        reason: 'initial',
        adminId: ctx.admin.id,
        createdAt: now,
      });
    }
  }
  return id;
}

export async function createProduct(
  db: Db,
  ctx: AdminContext,
  body: AdminProductCreate,
  now = new Date(),
) {
  const id = await write(db, async (tx) => {
    await ensureCategory(tx, body.product.categoryId);
    const slug = await unique(
      async (c) => (await tx.$count(s.products, eq(s.products.slug, c))) > 0,
      slugify(body.product.name),
    );
    const productId = newId('prd');
    const [last] = await tx
      .select({ max: sql<number>`coalesce(max(${s.products.sortOrder}), -1)::int` })
      .from(s.products);
    await tx.insert(s.products).values({
      id: productId,
      slug,
      ...body.product,
      sortOrder: (last?.max ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
    });
    await insertVariant(tx, ctx, productId, slug, body.first, 0, now);
    await audit(tx, ctx, 'product.created', 'product', productId, null, body);
    return productId;
  });
  return getProduct(db, id, now);
}

export async function updateProduct(
  db: Db,
  ctx: AdminContext,
  productId: string,
  input: AdminProductInput,
  now = new Date(),
) {
  await write(db, async (tx) => {
    const [before] = await tx.select().from(s.products).where(eq(s.products.id, productId));
    if (!before) throw notFound('Produit');
    await ensureCategory(tx, input.categoryId);
    // Les badges calculés (promo, rupture…) ne sont jamais stockés.
    await tx
      .update(s.products)
      .set({ ...input, updatedAt: now })
      .where(eq(s.products.id, productId));
    await audit(tx, ctx, 'product.updated', 'product', productId, before, input);
  });
  return getProduct(db, productId, now);
}

export async function addVariant(
  db: Db,
  ctx: AdminContext,
  productId: string,
  body: AdminNewVariant,
  now = new Date(),
) {
  await write(db, async (tx) => {
    const [p] = await tx.select().from(s.products).where(eq(s.products.id, productId));
    if (!p) throw notFound('Produit');
    const n = await tx.$count(s.productVariants, eq(s.productVariants.productId, productId));
    const id = await insertVariant(tx, ctx, productId, p.slug, body, n, now);
    await audit(tx, ctx, 'variant.created', 'variant', id, null, body);
  });
  return getProduct(db, productId, now);
}

async function loadVariant(tx: Tx, variantId: string) {
  const [v] = await tx.select().from(s.productVariants).where(eq(s.productVariants.id, variantId));
  if (!v) throw notFound('Format');
  return v;
}

export async function updateVariant(
  db: Db,
  ctx: AdminContext,
  variantId: string,
  input: AdminVariantInput,
  now = new Date(),
) {
  const v = await write(db, async (tx) => {
    const before = await loadVariant(tx, variantId);
    if (input.saleMode !== 'quote_only' && before.saleMode === 'quote_only') {
      const priced = await tx.$count(
        s.prices,
        and(eq(s.prices.variantId, variantId), eq(s.prices.segment, 'retail')),
      );
      if (priced === 0)
        throw invalid('Indiquez d’abord un prix public pour ce format.', 'saleMode');
    }
    await tx
      .update(s.productVariants)
      .set({
        ...input,
        packaging: input.packaging.toLowerCase(),
        leadTimeDays: input.saleMode === 'on_order' ? input.leadTimeDays : null,
        updatedAt: now,
      })
      .where(eq(s.productVariants.id, variantId));
    await audit(tx, ctx, 'variant.updated', 'variant', variantId, before, input);
    return before;
  });
  return getProduct(db, v.productId, now);
}

// ─── Prix : écriture ─────────────────────────────────────────────────────────

/** Nouveau prix public ou pro (immédiat ou programmé). L'ancien reste dans l'historique. */
export async function setPrice(
  db: Db,
  ctx: AdminContext,
  variantId: string,
  body: AdminPriceBody,
  now = new Date(),
) {
  const v = await write(db, async (tx) => {
    const variant = await loadVariant(tx, variantId);
    if (variant.saleMode === 'quote_only')
      throw invalid('Ce format est vendu sur devis : il n’a pas de prix catalogue.');
    const validFrom = body.validFrom ? new Date(body.validFrom) : now;
    if (validFrom.getTime() < now.getTime() - 60_000)
      throw invalid('La date d’effet ne peut pas être dans le passé.', 'validFrom');
    const [row] = await tx
      .insert(s.prices)
      .values({
        variantId,
        segment: body.segment,
        amount: body.amount,
        validFrom: validFrom > now ? validFrom : now,
        createdAt: now,
      })
      .returning({ id: s.prices.id });
    await audit(tx, ctx, 'price.set', 'variant', variantId, null, { ...body, priceId: row?.id });
    return variant;
  });
  return getProduct(db, v.productId, now);
}

/** Promotion sur le prix public : prix barré = prix public du moment, période sans chevauchement. */
export async function createPromotion(
  db: Db,
  ctx: AdminContext,
  variantId: string,
  body: AdminPromoBody,
  now = new Date(),
) {
  const v = await write(db, async (tx) => {
    const variant = await loadVariant(tx, variantId);
    if (variant.saleMode === 'quote_only')
      throw invalid('Un format sur devis ne peut pas être en promotion.');
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (endsAt <= now) throw invalid('La promotion doit se terminer dans le futur.', 'endsAt');

    const prices = await tx.select().from(s.prices).where(eq(s.prices.variantId, variantId));
    const base = currentFor(
      prices.filter((p) => p.compareAtAmount === null),
      variantId,
      'retail',
      startsAt > now ? startsAt : now,
    );
    if (!base) throw invalid('Ce format n’a pas de prix public : fixez-le avant la promotion.');
    if (body.amount >= base.amount)
      throw invalid(
        `Le prix promo doit être inférieur au prix public (${base.amount} F).`,
        'amount',
      );
    const overlapping = prices.some(
      (p) =>
        p.segment === 'retail' &&
        p.compareAtAmount !== null &&
        p.validFrom < endsAt &&
        (p.validTo === null || p.validTo > (startsAt > now ? startsAt : now)),
    );
    if (overlapping) throw invalid('Une promotion existe déjà sur cette période.', 'startsAt');

    const [row] = await tx
      .insert(s.prices)
      .values({
        variantId,
        segment: 'retail',
        amount: body.amount,
        compareAtAmount: base.amount,
        validFrom: startsAt > now ? startsAt : now,
        validTo: endsAt,
        createdAt: now,
      })
      .returning({ id: s.prices.id });
    await audit(tx, ctx, 'promotion.created', 'variant', variantId, null, {
      ...body,
      compareAt: base.amount,
      priceId: row?.id,
    });
    return variant;
  });
  return getProduct(db, v.productId, now);
}

/** Arrête une promotion ou un prix (immédiatement) ; un prix programmé est annulé. */
export async function endPrice(db: Db, ctx: AdminContext, priceId: number, now = new Date()) {
  const v = await write(db, async (tx) => {
    const [price] = await tx.select().from(s.prices).where(eq(s.prices.id, priceId));
    if (!price) throw notFound('Prix');
    if (price.validTo && price.validTo <= now) throw invalid('Ce prix n’est déjà plus en vigueur.');
    if (price.compareAtAmount === null && price.validFrom <= now && price.segment === 'retail') {
      // Arrêter le prix public en vigueur laisserait le format sans prix : on le remplace plutôt.
      const others = await tx
        .select({ id: s.prices.id })
        .from(s.prices)
        .where(
          and(
            eq(s.prices.variantId, price.variantId),
            eq(s.prices.segment, 'retail'),
            isNull(s.prices.compareAtAmount),
            lte(s.prices.validFrom, now),
            sql`${s.prices.id} <> ${price.id}`,
            or(isNull(s.prices.validTo), gt(s.prices.validTo, now)),
          ),
        );
      if (others.length === 0)
        throw invalid('Fixez un nouveau prix public plutôt que d’arrêter le prix actuel.');
    }
    // Programmé : jamais en vigueur (fin = début) ; en cours : se termine maintenant.
    const validTo = price.validFrom > now ? price.validFrom : now;
    await tx.update(s.prices).set({ validTo }).where(eq(s.prices.id, priceId));
    // Promo en cours arrêtée sans prix normal à côté (ex. prix barré permanent) :
    // le prix normal (celui qui était barré) redevient le prix public, sinon le format n'aurait plus de prix.
    if (price.compareAtAmount !== null && price.validFrom <= now && price.segment === 'retail') {
      const base = await tx.$count(
        s.prices,
        and(
          eq(s.prices.variantId, price.variantId),
          eq(s.prices.segment, 'retail'),
          isNull(s.prices.compareAtAmount),
          lte(s.prices.validFrom, now),
          or(isNull(s.prices.validTo), gt(s.prices.validTo, now)),
        ),
      );
      if (base === 0) {
        await tx.insert(s.prices).values({
          variantId: price.variantId,
          segment: 'retail',
          amount: price.compareAtAmount,
          validFrom: now,
          createdAt: now,
        });
      }
    }
    await audit(
      tx,
      ctx,
      'price.ended',
      'variant',
      price.variantId,
      { priceId, validTo: price.validTo },
      { validTo },
    );
    return loadVariant(tx, price.variantId);
  });
  return getProduct(db, v.productId, now);
}

// ─── Stock ───────────────────────────────────────────────────────────────────

/**
 * Mouvement de stock motivé. Le stock en main ne descend jamais sous la quantité déjà réservée
 * par des commandes en cours (mise à jour conditionnelle, sûre en cas d'accès simultanés).
 */
export async function moveStock(
  db: Db,
  ctx: AdminContext,
  variantId: string,
  body: AdminStockBody,
  now = new Date(),
) {
  const v = await write(db, async (tx) => {
    const variant = await loadVariant(tx, variantId);
    const [agency] = await tx.select().from(s.agencies).where(eq(s.agencies.id, body.agencyId));
    if (!agency) throw invalid('Agence inconnue.', 'agencyId');
    await tx
      .insert(s.stockLevels)
      .values({ variantId, agencyId: body.agencyId, onHand: 0, reserved: 0 })
      .onConflictDoNothing();
    const [level] = await tx
      .select()
      .from(s.stockLevels)
      .where(
        and(eq(s.stockLevels.variantId, variantId), eq(s.stockLevels.agencyId, body.agencyId)),
      );
    const onHand = level!.onHand;
    const delta =
      body.kind === 'add'
        ? body.quantity
        : body.kind === 'remove'
          ? -body.quantity
          : body.quantity - onHand;
    if (delta === 0)
      throw invalid('Le stock compté est identique au stock actuel : rien à corriger.', 'quantity');

    const [updated] = await tx
      .update(s.stockLevels)
      .set({ onHand: sql`${s.stockLevels.onHand} + ${delta}`, updatedAt: now })
      .where(
        and(
          eq(s.stockLevels.variantId, variantId),
          eq(s.stockLevels.agencyId, body.agencyId),
          eq(s.stockLevels.onHand, onHand),
          sql`${s.stockLevels.onHand} + ${delta} >= ${s.stockLevels.reserved}`,
        ),
      )
      .returning({ onHand: s.stockLevels.onHand });
    if (!updated) {
      throw invalid(
        `Impossible : ${level!.reserved} unité(s) sont réservées par des commandes en cours dans cette agence.`,
        'quantity',
      );
    }
    const reason: StockReason = body.kind === 'set' ? 'inventory' : body.reason;
    await tx.insert(s.stockMovements).values({
      variantId,
      agencyId: body.agencyId,
      delta,
      onHandAfter: updated.onHand,
      reason,
      note: body.note ?? null,
      adminId: ctx.admin.id,
      createdAt: now,
    });
    await audit(
      tx,
      ctx,
      'stock.moved',
      'variant',
      variantId,
      { onHand },
      { onHand: updated.onHand, delta, reason, agencyId: body.agencyId },
    );
    return variant;
  });
  return getProduct(db, v.productId, now);
}

export async function setThreshold(
  db: Db,
  ctx: AdminContext,
  variantId: string,
  agencyId: string,
  lowThreshold: number,
  now = new Date(),
) {
  const v = await write(db, async (tx) => {
    const variant = await loadVariant(tx, variantId);
    await tx
      .insert(s.stockLevels)
      .values({ variantId, agencyId, onHand: 0, reserved: 0 })
      .onConflictDoNothing();
    await tx
      .update(s.stockLevels)
      .set({ lowThreshold, updatedAt: now })
      .where(and(eq(s.stockLevels.variantId, variantId), eq(s.stockLevels.agencyId, agencyId)));
    await audit(tx, ctx, 'stock.threshold_set', 'variant', variantId, null, {
      agencyId,
      lowThreshold,
    });
    return variant;
  });
  return getProduct(db, v.productId, now);
}

export async function listMovements(db: Db, variantId: string): Promise<AdminStockMovement[]> {
  await loadVariant(db, variantId);
  const rows = await db
    .select({
      m: s.stockMovements,
      agencyName: s.agencies.name,
      adminName: s.adminUsers.name,
      orderNumber: s.orders.orderNumber,
    })
    .from(s.stockMovements)
    .innerJoin(s.agencies, eq(s.agencies.id, s.stockMovements.agencyId))
    .leftJoin(s.adminUsers, eq(s.adminUsers.id, s.stockMovements.adminId))
    .leftJoin(s.orders, eq(s.orders.id, s.stockMovements.orderId))
    .where(eq(s.stockMovements.variantId, variantId))
    .orderBy(desc(s.stockMovements.createdAt), desc(s.stockMovements.id))
    .limit(100);
  return rows.map(({ m, agencyName, adminName, orderNumber }) => ({
    id: m.id,
    agencyName,
    delta: m.delta,
    onHandAfter: m.onHandAfter,
    reason: m.reason as StockReason,
    note: m.note,
    actor: orderNumber ? `Commande ${orderNumber}` : (adminName ?? 'Système'),
    at: m.createdAt.toISOString(),
  }));
}

// ─── Photos ──────────────────────────────────────────────────────────────────

/** Taille des photos (carré, en pixels) : assez net sur téléphone, léger à charger. */
const PRODUCT_IMAGE_SIZE = 800;
const CATEGORY_IMAGE_SIZE = 600;

/** Met (ou remplace) la photo d'un produit ; l'ancienne est supprimée. */
export async function setProductImage(
  db: Db,
  ctx: AdminContext,
  productId: string,
  data: Buffer | null,
  now = new Date(),
) {
  const [p] = await db.select().from(s.products).where(eq(s.products.id, productId));
  if (!p) throw notFound('Produit');
  const url = data ? await storeImage('products', productId, data, PRODUCT_IMAGE_SIZE) : null;
  await write(db, async (tx) => {
    await tx
      .update(s.products)
      .set({ imageUrl: url, updatedAt: now })
      .where(eq(s.products.id, productId));
    await audit(
      tx,
      ctx,
      url ? 'product.image_set' : 'product.image_removed',
      'product',
      productId,
      { imageUrl: p.imageUrl },
      { imageUrl: url },
    );
  });
  await removeImage(p.imageUrl);
  return getProduct(db, productId, now);
}

/** Met (ou remplace) la photo d'un rayon ; l'ancienne est supprimée. */
export async function setCategoryImage(
  db: Db,
  ctx: AdminContext,
  categoryId: string,
  data: Buffer | null,
) {
  const [c] = await db.select().from(s.categories).where(eq(s.categories.id, categoryId));
  if (!c) throw notFound('Rayon');
  const url = data ? await storeImage('categories', categoryId, data, CATEGORY_IMAGE_SIZE) : null;
  await write(db, async (tx) => {
    await tx
      .update(s.categories)
      .set({ imageUrl: url, updatedAt: new Date() })
      .where(eq(s.categories.id, categoryId));
    await audit(
      tx,
      ctx,
      url ? 'category.image_set' : 'category.image_removed',
      'category',
      categoryId,
      { imageUrl: c.imageUrl },
      { imageUrl: url },
    );
  });
  await removeImage(c.imageUrl);
  return listCategories(db);
}
