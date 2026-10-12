import { photoBySignature } from '@/server/kyc/service';

/** Photo d'identité, pour l'équipe : adresse signée et valable quelques minutes (jamais mise en cache). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const file = await photoBySignature(q.get('key') ?? '', q.get('exp') ?? '', q.get('sig') ?? '');
  if (!file) return new Response('Lien expiré ou invalide', { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
