import { isSafeKey, mediaStorage } from '@/server/media';

/**
 * Photos du catalogue. Chaque photo a un nom unique (remplacer = nouveau nom) :
 * elle peut être gardée en cache un an par le téléphone et par un CDN.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const key = (await ctx.params).key.join('/');
  const file = isSafeKey(key) ? await mediaStorage().get(key) : null;
  if (!file) return new Response('Introuvable', { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      'content-type': file.contentType,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
