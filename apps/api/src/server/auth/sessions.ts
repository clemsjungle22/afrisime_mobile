import type { AuthTokens, DeviceInfo } from '@afrisime/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { log } from '../log';
import { ACCESS_TTL_S, REFRESH_TTL_S, randomSecret, safeEqual, sha256, signAccessToken } from './tokens';

/**
 * Jeton de renouvellement = « <id de session>.<secret> ». Seule l'empreinte du secret est stockée,
 * et il est remplacé à chaque renouvellement (rotation).
 */
const unauthenticated = () => new ApiError('UNAUTHENTICATED', 'Session expirée. Reconnectez-vous.');

async function issue(customerId: string, sessionId: string, secret: string, now: Date): Promise<AuthTokens> {
  return {
    accessToken: await signAccessToken(customerId, sessionId, now),
    refreshToken: `${sessionId}.${secret}`,
    expiresIn: ACCESS_TTL_S,
  };
}

export async function createSession(db: Db, customerId: string, device: DeviceInfo | null, now = new Date()) {
  const id = newId('ses');
  const secret = randomSecret();
  await db.insert(s.sessions).values({
    id,
    customerId,
    refreshTokenHash: sha256(secret),
    device,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TTL_S * 1000),
  });
  return issue(customerId, id, secret, now);
}

export async function refreshSession(db: Db, refreshToken: string, now = new Date()): Promise<AuthTokens> {
  const [sessionId, secret] = refreshToken.split('.');
  if (!sessionId || !secret) throw unauthenticated();

  const [session] = await db
    .select()
    .from(s.sessions)
    .where(and(eq(s.sessions.id, sessionId), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, now)))
    .limit(1);
  if (!session) throw unauthenticated();

  if (!safeEqual(sha256(secret), session.refreshTokenHash)) {
    // Ancien jeton réutilisé : il a sans doute été copié. On ferme la session par précaution.
    await db.update(s.sessions).set({ revokedAt: now }).where(eq(s.sessions.id, session.id));
    log.warn('jeton de renouvellement réutilisé : session fermée', { sessionId: session.id });
    throw unauthenticated();
  }

  const next = randomSecret();
  // Rotation conditionnelle : si deux renouvellements arrivent en même temps, un seul gagne.
  const rotated = await db
    .update(s.sessions)
    .set({
      refreshTokenHash: sha256(next),
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_S * 1000),
    })
    .where(and(eq(s.sessions.id, session.id), eq(s.sessions.refreshTokenHash, session.refreshTokenHash)))
    .returning({ id: s.sessions.id });
  if (rotated.length === 0) throw unauthenticated();
  return issue(session.customerId, session.id, next, now);
}

export async function revokeSession(db: Db, sessionId: string, now = new Date()) {
  await db
    .update(s.sessions)
    .set({ revokedAt: now })
    .where(and(eq(s.sessions.id, sessionId), isNull(s.sessions.revokedAt)));
}
