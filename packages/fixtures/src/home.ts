import type { Home, HomeBanner, HomeSection, ProductSummary } from '@afrisime/shared';
import { mockCategories } from './categories';
import { mockProducts, toSummary } from './products';

const summaries: ProductSummary[] = mockProducts.map(toSummary);

function pick(filter: (p: ProductSummary) => boolean, max = 8): ProductSummary[] {
  return summaries.filter(filter).slice(0, max);
}

/** Bannières d'exemple (administrables côté serveur, RB-010). */
export const homeBanners: HomeBanner[] = [
  {
    id: 'ban_bienvenue',
    title: 'La distribution alimentaire, autrement',
    subtitle: 'Vos produits du quotidien livrés à Lomé, au prix juste.',
    imageUrl: null,
    ctaLabel: 'Découvrir la boutique',
    link: '/boutique',
    tone: 'brand',
  },
  {
    id: 'ban_pro',
    title: 'Revendeurs, restaurants, PME',
    subtitle: 'Formats pro et tarifs dégressifs sur les sacs et bidons.',
    imageUrl: null,
    ctaLabel: 'Voir les huiles',
    link: '/boutique?category=huiles',
    tone: 'accent',
  },
  {
    id: 'ban_local',
    title: 'Le meilleur du Togo',
    subtitle: 'Gari, soja, karité : soutenez les producteurs locaux.',
    imageUrl: null,
    ctaLabel: "Produits d'ici",
    link: '/boutique?category=produits-locaux',
    tone: 'neutral',
  },
];

/** Construit la réponse de GET /v1/home. `now` est injecté pour la date de fin des ventes flash. */
export function buildMockHome(now: Date = new Date()): Home {
  const flashEnd = new Date(now);
  flashEnd.setHours(now.getHours() + 6, 0, 0, 0);

  const sections: HomeSection[] = [
    {
      id: 'sec_flash',
      type: 'flash_sale',
      title: 'Ventes flash',
      endsAt: flashEnd.toISOString(),
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

  return {
    banners: homeBanners,
    categories: mockCategories.map(({ id, slug, name, imageUrl, color }) => ({
      id,
      slug,
      name,
      imageUrl,
      color,
    })),
    sections: sections.filter((s) => s.items.length > 0),
  };
}
