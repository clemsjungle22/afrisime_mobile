import { z } from 'zod';
import { HexColor, ProductSummary, MediaUrl } from './catalog';

/** Lien interne de l'app (chemin Expo Router), validé avant navigation. */
export const AppLink = z.string().regex(/^\/[a-z0-9\-/[\]?=&_]*$/i);

export const BannerTone = z.enum(['brand', 'accent', 'neutral']);
export type BannerTone = z.infer<typeof BannerTone>;

/** Petit texte du haut d'une carte, par défaut selon son style. */
export const DEFAULT_BANNER_EYEBROWS: Record<BannerTone, string> = {
  brand: 'AFRISIME · LOMÉ',
  accent: 'FORMATS PRO',
  neutral: 'MADE IN TOGO',
};

export const HomeBanner = z.object({
  id: z.string(),
  /** Petit texte au-dessus du titre (null : texte par défaut du style). */
  eyebrow: z.string().nullable(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: MediaUrl.nullable(),
  ctaLabel: z.string().nullable(),
  link: AppLink.nullable(),
  /** Ton visuel décidé par le back-office (paramétrable, RB-010). */
  tone: BannerTone,
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
  /** Petit texte au-dessus du titre (« LES PRÉFÉRÉS DE LOMÉ »). */
  overline: z.string().nullable(),
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

// ─── Apparence de l'accueil (réglée depuis le back-office) ───────────────────

/** Blocs de l'accueil dont l'équipe règle les textes et l'affichage. */
export const HomeBlock = z.enum([
  'categories',
  'flash_sale',
  'best_sellers',
  'local_products',
  'new_arrivals',
]);
export type HomeBlock = z.infer<typeof HomeBlock>;

export const HomeBlockText = z.object({
  overline: z.string().trim().max(40),
  title: z.string().trim().min(1, 'Titre obligatoire').max(60),
  visible: z.boolean(),
});
export type HomeBlockText = z.infer<typeof HomeBlockText>;

export const HomeAppearance = z.object({
  /** Logo de l'en-tête (null : logo intégré à l'app). */
  logoUrl: MediaUrl.nullable(),
  /** Phrase sous « Bonjour ». */
  greetingSubtitle: z.string().trim().min(1).max(80),
  blocks: z.record(HomeBlock, HomeBlockText),
});
export type HomeAppearance = z.infer<typeof HomeAppearance>;

/** Textes d'origine : utilisés tant que l'équipe ne les a pas modifiés. */
export const DEFAULT_HOME_APPEARANCE: HomeAppearance = {
  logoUrl: null,
  greetingSubtitle: 'Qu’allons-nous vous livrer aujourd’hui ?',
  blocks: {
    categories: { overline: 'FAITES LE TOUR', title: 'Nos rayons', visible: true },
    flash_sale: { overline: '⚡ À NE PAS MANQUER', title: 'Ventes flash', visible: true },
    best_sellers: { overline: 'LES PRÉFÉRÉS DE LOMÉ', title: 'Les plus achetés', visible: true },
    local_products: { overline: 'SOUTENEZ LE LOCAL', title: "Produits d'ici", visible: true },
    new_arrivals: { overline: 'TOUT JUSTE ARRIVÉS', title: 'Nouveautés', visible: true },
  },
};

/** Réponse de GET /v1/home. L'ordre des sections est décidé par le serveur. */
export const Home = z.object({
  banners: z.array(HomeBanner),
  categories: z.array(HomeCategory),
  sections: z.array(HomeSection),
  /** Absent dans une réponse mise en cache par une ancienne version : textes d'origine. */
  appearance: HomeAppearance.optional(),
});
export type Home = z.infer<typeof Home>;
