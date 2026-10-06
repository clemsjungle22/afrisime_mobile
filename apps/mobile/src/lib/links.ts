import { AppLink } from '@afrisime/shared';
import { router, type Href } from 'expo-router';

/**
 * Ouvre un lien interne fourni par l'API (bannière, « Voir tout »).
 * Validé par zod : un lien mal formé est ignoré au lieu de faire planter la navigation.
 */
export function openAppLink(link: string | null): void {
  if (!link) return;
  const parsed = AppLink.safeParse(link);
  if (!parsed.success) return;
  router.push(parsed.data as Href);
}

export function openProduct(slug: string): void {
  router.push({ pathname: '/product/[slug]', params: { slug } });
}
