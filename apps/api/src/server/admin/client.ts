import { clientIp } from '../auth/context';

/** Appareil de la personne connectée (le serveur du back-office transmet l'IP via X-Forwarded-For). */
export function clientOf(req: Request) {
  return { ip: clientIp(req), userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null };
}
