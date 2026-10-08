import { apiConfig } from '@/api/config';

/**
 * Adresse d'une photo du catalogue : les adresses relatives (/media/…) sont servies par le serveur
 * AfriSime, on les complète avec son adresse. null si aucune photo (on affiche alors les initiales).
 */
export function mediaUri(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return apiConfig.baseUrl ? `${apiConfig.baseUrl}${url}` : null;
  return url;
}
