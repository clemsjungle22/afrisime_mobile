import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env';

/** Jeton d'accès : 15 min, signé (HS256). Il ne contient que des identifiants, aucune donnée personnelle. */
export const ACCESS_TTL_S = 15 * 60;
/** Session (jeton de renouvellement) : 60 jours, prolongée à chaque renouvellement. */
export const REFRESH_TTL_S = 60 * 24 * 3600;

const ISSUER = 'afrisime-api';
const AUDIENCE = 'afrisime-app';

const key = () => new TextEncoder().encode(env().AUTH_SECRET);

export async function signAccessToken(customerId: string, sessionId: string, now = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(customerId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TTL_S)
    .sign(key());
}

/** null si le jeton est absent, falsifié ou expiré. */
export async function verifyAccessToken(
  token: string,
  now = new Date(),
): Promise<{ customerId: string; sessionId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
    return { customerId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

/** Secret aléatoire (base64url). */
export const randomSecret = (bytes = 32) => randomBytes(bytes).toString('base64url');

/** Empreinte d'un jeton de renouvellement (stockée à la place du jeton). */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('base64url');

/** Empreinte d'un code OTP, liée à sa demande : inutilisable sans AUTH_SECRET. */
export const otpHash = (requestId: string, code: string) =>
  createHmac('sha256', env().AUTH_SECRET).update(`${requestId}:${code}`).digest('base64url');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Code à 6 chiffres, tiré uniformément. */
export function randomOtpCode(): string {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}
