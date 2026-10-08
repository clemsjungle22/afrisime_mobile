import { z } from 'zod';
import { MediaUrl } from './catalog';
import { AppLink, BannerTone, HomeAppearance, HomeBlock, HomeBlockText } from './home';

/**
 * Contrat du back-office pour l'accueil de l'app (/v1/admin/home) :
 * cartes défilantes (bannières), textes et affichage des sections, logo.
 */

export const BANNER_TONE_LABELS: Record<BannerTone, string> = {
  brand: 'Vert AfriSime',
  accent: 'Doré',
  neutral: 'Vert nature',
};

export const HOME_BLOCK_LABELS: Record<HomeBlock, string> = {
  categories: 'Nos rayons',
  flash_sale: 'Ventes flash',
  best_sellers: 'Les plus achetés',
  local_products: "Produits d'ici",
  new_arrivals: 'Nouveautés',
};

export const BannerState = z.enum(['live', 'scheduled', 'ended', 'inactive']);
export type BannerState = z.infer<typeof BannerState>;

export const AdminBanner = z.object({
  id: z.string(),
  eyebrow: z.string().nullable(),
  title: z.string(),
  subtitle: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  link: AppLink.nullable(),
  tone: BannerTone,
  imageUrl: MediaUrl.nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  /** Visible dans l'app en ce moment, programmée, terminée ou désactivée. */
  state: BannerState,
});
export type AdminBanner = z.infer<typeof AdminBanner>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const AdminBannerInput = z
  .object({
    eyebrow: optionalText(40),
    title: z.string().trim().min(2, 'Indiquez un titre').max(80),
    subtitle: optionalText(140),
    ctaLabel: optionalText(30),
    link: AppLink.nullable(),
    tone: BannerTone,
    isActive: z.boolean(),
    startsAt: z.string().datetime().nullable(),
    endsAt: z.string().datetime().nullable(),
  })
  .refine((b) => !b.startsAt || !b.endsAt || Date.parse(b.endsAt) > Date.parse(b.startsAt), {
    message: 'La fin doit être après le début',
    path: ['endsAt'],
  })
  .refine((b) => !b.ctaLabel || b.link, {
    message: 'Un bouton doit mener quelque part : choisissez une destination',
    path: ['link'],
  });
export type AdminBannerInput = z.infer<typeof AdminBannerInput>;

export const AdminBannerMoveBody = z.object({ direction: z.enum(['up', 'down']) });

/** Textes et affichage des sections (le logo a ses propres adresses d'envoi). */
export const AdminHomeSettingsBody = z.object({
  greetingSubtitle: z.string().trim().min(1, 'Phrase obligatoire').max(80),
  blocks: z.record(HomeBlock, HomeBlockText),
});
export type AdminHomeSettingsBody = z.infer<typeof AdminHomeSettingsBody>;

export const AdminHome = z.object({
  banners: z.array(AdminBanner),
  appearance: HomeAppearance,
});
export type AdminHome = z.infer<typeof AdminHome>;
