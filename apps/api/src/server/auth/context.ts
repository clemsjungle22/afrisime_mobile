import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { verifyAccessToken } from './tokens';

export type Customer = typeof s.customers.$inferSelect;
export type AuthContext = { customer: Customer; sessionId: string };

const unauthenticated = () => new ApiError('UNAUTHENTICATED', 'Session expirée. Reconnectez-vous.');

/**
 * Client connecté d'après l'en-tête Authorization. La session est relue en base :
 * une déconnexion (ou une session révoquée) prend effet immédiatement, sans attendre l'expiration du jeton.
 */
export async function authenticate(req: Request, now = new Date()): Promise<AuthContext | null> {
  const header = req.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) throw unauthenticated();
  const claims = await verifyAccessToken(match[1]!, now);
  if (!claims) throw unauthenticated();

  const [row] = await getDb()
    .select({ customer: s.customers })
    .from(s.sessions)
    .innerJoin(s.customers, eq(s.customers.id, s.sessions.customerId))
    .where(
      and(
        eq(s.sessions.id, claims.sessionId),
        eq(s.sessions.customerId, claims.customerId),
        isNull(s.sessions.revokedAt),
        gt(s.sessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row || row.customer.status !== 'active') throw unauthenticated();
  return { customer: row.customer, sessionId: claims.sessionId };
}

/** Adresse IP du client (derrière l'hébergeur : premier élément de X-Forwarded-For). */
export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'inconnue';
}
