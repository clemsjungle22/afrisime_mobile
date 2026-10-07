import type { HomeSection } from './home';
import type { ProductDetail, ProductSummary, Variant } from './catalog';

/**
 * Règles d'assemblage du catalogue, partagées par le serveur et le mode démo de l'app :
 * mêmes données en entrée → mêmes réponses.
 */

/** Champs calculés d'une fiche à partir de ses formats (le premier format est celui par défaut). */
export function summarizeVariants(variants: Variant[]) {
  const [defaultVariant] = variants;
  if (!defaultVariant) throw new Error('Produit sans format');
  const prices = variants.map((v) => v.price).filter((p): p is number => p !== null);
  const discountPercent =
    defaultVariant.compareAtPrice !== null && defaultVariant.price !== null
      ? Math.round((1 - defaultVariant.price / defaultVariant.compareAtPrice) * 100)
      : null;
  return {
    defaultVariant,
    variantsCount: variants.length,
    priceFrom: prices.length > 0 ? Math.min(...prices) : null,
    priceTo: prices.length > 0 ? Math.max(...prices) : null,
    discountPercent,
  };
}

export function toSummary(p: ProductDetail): ProductSummary {
  const { description: _d, categoryId: _c, images: _i, variants: _v, related: _r, ...summary } = p;
  return summary;
}

/** Produits associés : d'abord le même rayon, puis des populaires d'autres rayons (6 au plus). */
export function relatedOf(all: readonly ProductDetail[], p: ProductDetail): ProductSummary[] {
  const sameCategory = all.filter((o) => o.categoryId === p.categoryId && o.slug !== p.slug);
  const popular = all.filter((o) => o.badges.includes('popular') && o.slug !== p.slug && o.categoryId !== p.categoryId);
  return [...sameCategory, ...popular].slice(0, 6).map(toSummary);
}

/** Sections de l'accueil (les sections vides sont omises). */
export function buildHomeSections(summaries: readonly ProductSummary[], flashEndsAt: string | null): HomeSection[] {
  const pick = (filter: (p: ProductSummary) => boolean, max = 8) => summaries.filter(filter).slice(0, max);
  const sections: HomeSection[] = [
    {
      id: 'sec_flash',
      type: 'flash_sale',
      title: 'Ventes flash',
      endsAt: flashEndsAt,
      link: '/boutique',
      items: pick((p) => p.badges.includes('promotion')),
    },
    {
      id: 'sec_best',
      type: 'best_sellers',
      title: 'Les plus achetés',
      endsAt: null,
      link: '/boutique',
      items: pick((p) => p.badges.includes('popular')),
    },
    {
      id: 'sec_local',
      type: 'local_products',
      title: "Produits d'ici",
      endsAt: null,
      link: '/boutique?category=produits-locaux',
      items: pick((p) => p.origin === 'local'),
    },
    {
      id: 'sec_new',
      type: 'new_arrivals',
      title: 'Nouveautés',
      endsAt: null,
      link: '/boutique',
      items: pick((p) => p.badges.includes('new')),
    },
  ];
  return sections.filter((s) => s.items.length > 0);
}
