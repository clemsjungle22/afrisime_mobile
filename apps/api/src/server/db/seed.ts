import {
  DELIVERY_RULES,
  SEED_ADDRESS,
  SEED_USER,
  homeBanners,
  packSeeds,
  mockCategories,
  mockOnboardingOptions,
  mockZones,
  productSeeds,
  variantId,
} from '@afrisime/fixtures';
import { inArray, sql } from 'drizzle-orm';
import type { Db } from './client';
import * as s from './schema';

/** Quantité posée pour un format « non limité » dans les données d'exemple. */
export const UNLIMITED_DEMO_STOCK = 1000;

const DEFAULT_AGENCY =
  mockOnboardingOptions.agencies.find((a) => a.isDefault)?.id ?? 'agc_lome_centre';

/** Segment tarifaire d'un type de client (les pros passent en « pro » une fois validés). */
const segmentOf = (customerTypeId: string) => (customerTypeId === 'particulier' ? 'retail' : 'pro');

/** Colonne de la ligne rejetée par le conflit (`excluded.xxx`) : valeur à écrire lors d'un upsert. */
const ex = (column: string) => sql.raw(`excluded.${column}`);

export type SeedCounts = Record<string, number>;

/**
 * Remplit la base avec les données d'EXEMPLE (@afrisime/fixtures), identiques à celles du mode démo de l'app.
 * Rejouable : chaque table est mise à jour par clé (aucun doublon), les prix d'exemple sont recréés.
 * À ne pas lancer sur une base de production : il écrase les valeurs d'exemple.
 */
export async function seedDatabase(db: Db): Promise<SeedCounts> {
  const productRows = productSeeds.map((p, i) => {
    const category = mockCategories.find((c) => c.slug === p.category);
    if (!category) throw new Error(`Rayon inconnu pour ${p.slug} : ${p.category}`);
    return {
      id: `prd_${String(i + 1).padStart(4, '0')}`,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      origin: p.origin,
      categoryId: category.id,
      description: p.description,
      badges: [...(p.badges ?? [])],
      sortOrder: i,
    };
  });

  const variantRows = productSeeds.flatMap((p, pi) =>
    p.variants.map((v, i) => ({
      id: variantId(p.slug, i),
      productId: productRows[pi]!.id,
      sku: `${p.slug.toUpperCase().slice(0, 12)}-${i}`,
      label: v.label,
      packaging: v.packaging,
      saleMode:
        v.availability === 'on_order' || v.availability === 'quote_only'
          ? v.availability
          : ('standard' as const),
      leadTimeDays: v.leadTimeDays ?? null,
      minQuantity: v.minQuantity ?? 1,
      isPro: v.isPro ?? false,
      sortOrder: i,
    })),
  );

  const priceRows = productSeeds.flatMap((p) =>
    p.variants.flatMap((v, i) =>
      v.price === null
        ? []
        : [
            {
              variantId: variantId(p.slug, i),
              segment: 'retail',
              amount: v.price,
              compareAtAmount: v.compareAtPrice ?? null,
            },
          ],
    ),
  );

  const stockRows = productSeeds.flatMap((p) =>
    p.variants.map((v, i) => ({
      variantId: variantId(p.slug, i),
      agencyId: DEFAULT_AGENCY,
      onHand: v.availability === 'unavailable' ? 0 : (v.stock ?? UNLIMITED_DEMO_STOCK),
      reserved: 0,
      lowThreshold: v.stock !== undefined ? 2 : 10,
    })),
  );

  const settings = [
    {
      key: 'delivery.free_above',
      value: DELIVERY_RULES.freeAbove,
      description: 'Livraison offerte à partir de ce sous-total (FCFA)',
    },
    {
      key: 'delivery.min_order',
      value: DELIVERY_RULES.minOrderAmount,
      description: 'Sous-total minimum pour être livré (FCFA)',
    },
    {
      key: 'payment.cod_max',
      value: DELIVERY_RULES.cashOnDeliveryMax,
      description: 'Plafond du paiement à la livraison (FCFA)',
    },
    {
      key: 'checkout.lead_time_min',
      value: DELIVERY_RULES.leadTimeMs / 60_000,
      description: 'Préparation minimale avant un créneau (minutes)',
    },
    {
      key: 'checkout.quote_ttl_min',
      value: DELIVERY_RULES.quoteTtlMs / 60_000,
      description: "Validité d'un devis (minutes)",
    },
    {
      key: 'legal.terms',
      value: {
        version: mockOnboardingOptions.termsVersion,
        termsUrl: mockOnboardingOptions.termsUrl,
        privacyUrl: mockOnboardingOptions.privacyUrl,
      },
      description: 'CGU et politique de confidentialité en vigueur',
    },
  ];

  await db.transaction(async (tx) => {
    await tx
      .insert(s.categories)
      .values(
        mockCategories.map((c, i) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          description: c.description,
          imageUrl: c.imageUrl,
          color: c.color,
          sortOrder: i,
        })),
      )
      .onConflictDoUpdate({
        target: s.categories.id,
        set: {
          slug: ex('slug'),
          name: ex('name'),
          description: ex('description'),
          color: ex('color'),
          sortOrder: ex('sort_order'),
          updatedAt: sql`now()`,
        },
      });

    await tx
      .insert(s.agencies)
      .values(mockOnboardingOptions.agencies.map((a, i) => ({ ...a, sortOrder: i })))
      .onConflictDoUpdate({
        target: s.agencies.id,
        set: {
          name: ex('name'),
          city: ex('city'),
          address: ex('address'),
          phone: ex('phone'),
          openingHours: ex('opening_hours'),
          isDefault: ex('is_default'),
          sortOrder: ex('sort_order'),
        },
      });

    await tx
      .insert(s.products)
      .values(productRows)
      .onConflictDoUpdate({
        target: s.products.id,
        set: {
          slug: ex('slug'),
          name: ex('name'),
          brand: ex('brand'),
          origin: ex('origin'),
          categoryId: ex('category_id'),
          description: ex('description'),
          badges: ex('badges'),
          sortOrder: ex('sort_order'),
          updatedAt: sql`now()`,
        },
      });

    await tx
      .insert(s.productVariants)
      .values(variantRows)
      .onConflictDoUpdate({
        target: s.productVariants.id,
        set: {
          productId: ex('product_id'),
          sku: ex('sku'),
          label: ex('label'),
          packaging: ex('packaging'),
          saleMode: ex('sale_mode'),
          leadTimeDays: ex('lead_time_days'),
          minQuantity: ex('min_quantity'),
          isPro: ex('is_pro'),
          sortOrder: ex('sort_order'),
          updatedAt: sql`now()`,
        },
      });

    // Prix d'exemple : remplacés en bloc (pas de clé naturelle stable pour un historique de prix).
    await tx.delete(s.prices).where(
      inArray(
        s.prices.variantId,
        variantRows.map((v) => v.id),
      ),
    );
    await tx.insert(s.prices).values(priceRows);

    await tx
      .insert(s.stockLevels)
      .values(stockRows)
      .onConflictDoUpdate({
        target: [s.stockLevels.variantId, s.stockLevels.agencyId],
        set: {
          onHand: ex('on_hand'),
          reserved: ex('reserved'),
          lowThreshold: ex('low_threshold'),
          updatedAt: sql`now()`,
        },
      });

    await tx
      .insert(s.deliveryZones)
      .values(
        mockZones.map((z, i) => ({
          id: z.id,
          name: z.name,
          fee: z.fee,
          cashOnDelivery: z.cashOnDelivery,
          districts: z.districts,
          sortOrder: i,
        })),
      )
      .onConflictDoUpdate({
        target: s.deliveryZones.id,
        set: {
          name: ex('name'),
          fee: ex('fee'),
          cashOnDelivery: ex('cash_on_delivery'),
          districts: ex('districts'),
          sortOrder: ex('sort_order'),
        },
      });

    await tx
      .insert(s.appSettings)
      .values(settings)
      .onConflictDoUpdate({
        target: s.appSettings.key,
        set: { value: ex('value'), description: ex('description'), updatedAt: sql`now()` },
      });

    await tx
      .insert(s.customerTypes)
      .values(
        mockOnboardingOptions.customerTypes.map((t, i) => ({
          ...t,
          segment: segmentOf(t.id),
          sortOrder: i,
        })),
      )
      .onConflictDoUpdate({
        target: s.customerTypes.id,
        set: {
          label: ex('label'),
          description: ex('description'),
          requiresReview: ex('requires_review'),
          segment: ex('segment'),
          sortOrder: ex('sort_order'),
        },
      });

    // Packs d'exemple : jamais écrasés (l'équipe les modifie dans le back-office).
    await tx
      .insert(s.packs)
      .values(packSeeds.map((p, i) => ({ ...p, sortOrder: i })))
      .onConflictDoNothing();

    await tx
      .insert(s.homeBanners)
      .values(homeBanners.map((b, i) => ({ ...b, sortOrder: i })))
      .onConflictDoUpdate({
        target: s.homeBanners.id,
        set: {
          eyebrow: ex('eyebrow'),
          title: ex('title'),
          subtitle: ex('subtitle'),
          imageUrl: ex('image_url'),
          ctaLabel: ex('cta_label'),
          link: ex('link'),
          tone: ex('tone'),
          sortOrder: ex('sort_order'),
        },
      });

    // Compte de démonstration (le même que dans l'app en mode démo). Jamais écrasé s'il existe.
    await tx
      .insert(s.customers)
      .values({
        id: SEED_USER.id,
        phone: SEED_USER.phone,
        firstName: SEED_USER.firstName,
        lastName: SEED_USER.lastName,
        email: SEED_USER.email,
        customerTypeId: SEED_USER.customerTypeId,
        customerTypePending: SEED_USER.customerTypePending,
        segment: segmentOf(SEED_USER.customerTypeId ?? 'particulier'),
        agencyId: SEED_USER.agencyId,
        marketingConsent: SEED_USER.consents.marketing,
        termsVersion: SEED_USER.consents.termsVersion,
        createdAt: new Date(SEED_USER.createdAt),
      })
      .onConflictDoNothing();

    await tx
      .insert(s.addresses)
      .values({
        id: SEED_ADDRESS.id,
        customerId: SEED_USER.id,
        label: SEED_ADDRESS.label,
        recipientName: SEED_ADDRESS.recipientName,
        phone: SEED_ADDRESS.phone,
        district: SEED_ADDRESS.district,
        city: SEED_ADDRESS.city,
        landmark: SEED_ADDRESS.landmark,
        instructions: SEED_ADDRESS.instructions,
        zoneId: SEED_ADDRESS.zoneId,
        isDefault: SEED_ADDRESS.isDefault,
      })
      .onConflictDoNothing();
  });

  return {
    categories: mockCategories.length,
    agencies: mockOnboardingOptions.agencies.length,
    products: productRows.length,
    variants: variantRows.length,
    prices: priceRows.length,
    stockLevels: stockRows.length,
    deliveryZones: mockZones.length,
    settings: settings.length,
    customerTypes: mockOnboardingOptions.customerTypes.length,
    banners: homeBanners.length,
  };
}
