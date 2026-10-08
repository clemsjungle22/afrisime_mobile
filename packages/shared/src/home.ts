import { z } from 'zod';
import { HexColor, ProductSummary, MediaUrl } from './catalog';

/** Lien interne de l'app (chemin Expo Router), validé avant navigation. */
export const AppLink = z.string().regex(/^\/[a-z0-9\-/[\]?=&_]*$/i);

export const HomeBanner = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: MediaUrl.nullable(),
  ctaLabel: z.string().nullable(),
  link: AppLink.nullable(),
  /** Ton visuel décidé par le back-office (paramétrable, RB-010). */
  tone: z.enum(['brand', 'accent', 'neutral']),
});
export type HomeBanner = z.infer<typeof HomeBanner>;

export const HomeSectionType = z.enum([
  'flash_sale',
  'new_arrivals',
  'best_sellers',
  'local_products',
  'for_you',
]);
export type HomeSectionType = z.infer<typeof HomeSectionType>;

export const HomeSection = z.object({
  id: z.string(),
  type: HomeSectionType,
  title: z.string(),
  /** Fin de l'offre (ventes flash), ISO 8601 UTC. */
  endsAt: z.string().datetime().nullable(),
  /** Lien « Voir tout ». */
  link: AppLink.nullable(),
  items: z.array(ProductSummary),
});
export type HomeSection = z.infer<typeof HomeSection>;

export const HomeCategory = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  imageUrl: MediaUrl.nullable(),
  color: HexColor,
});
export type HomeCategory = z.infer<typeof HomeCategory>;

/** Réponse de GET /v1/home. L'ordre des sections est décidé par le serveur. */
export const Home = z.object({
  banners: z.array(HomeBanner),
  categories: z.array(HomeCategory),
  sections: z.array(HomeSection),
});
export type Home = z.infer<typeof Home>;
