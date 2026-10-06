import type {
  OtpRequestResponse,
  OtpVerifyBody,
  OtpVerifyResponse,
  ProfileUpdateBody,
  UserProfile,
} from '@afrisime/shared';
import { loadDb, saveDb } from './db';
import { mockOnboardingOptions } from './data/onboarding';
import { mockError } from './simulate';

/**
 * Logique du FAUX serveur d'authentification (mode mock).
 * Code OTP de test : 123456. Jetons « lisibles » : mockA.<userId>.<expiration ms>.
 */

export const MOCK_OTP_CODE = '123456';
export const RATE_LIMITED_PHONE = '+22899999999';
export const OTP_TTL_S = 300;
export const RESEND_DELAY_S = 30;
export const MAX_ATTEMPTS = 5;
export const ACCESS_TTL_S = 15 * 60;

type OtpRequestState = {
  phone: string;
  attempts: number;
  expiresAt: number;
  resendAt: number;
};

const otpRequests = new Map<string, OtpRequestState>();
let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export function resetOtpRequests(): void {
  otpRequests.clear();
}

export function requestOtp(phone: string, now = Date.now()): OtpRequestResponse {
  if (phone === RATE_LIMITED_PHONE) {
    throw mockError('RATE_LIMITED', 'Trop de demandes pour ce numéro. Réessayez dans 10 minutes.', 429, {
      retryIn: 600,
    });
  }
  for (const req of otpRequests.values()) {
    if (req.phone === phone && req.resendAt > now) {
      const retryIn = Math.ceil((req.resendAt - now) / 1000);
      throw mockError('RATE_LIMITED', `Patientez ${retryIn} s avant de redemander un code.`, 429, { retryIn });
    }
  }
  const requestId = newId('otp');
  otpRequests.set(requestId, {
    phone,
    attempts: 0,
    expiresAt: now + OTP_TTL_S * 1000,
    resendAt: now + RESEND_DELAY_S * 1000,
  });
  return { requestId, expiresIn: OTP_TTL_S, resendIn: RESEND_DELAY_S };
}

function isProfileComplete(u: UserProfile): boolean {
  return Boolean(u.firstName && u.lastName && u.customerTypeId && u.agencyId && u.consents.termsVersion);
}

async function issueTokens(userId: string, now: number) {
  const db = await loadDb();
  const nonce = newId('r');
  await saveDb({ ...db, refreshNonces: { ...db.refreshNonces, [userId]: nonce } });
  return {
    accessToken: `mockA.${userId}.${now + ACCESS_TTL_S * 1000}`,
    refreshToken: `mockR.${userId}.${nonce}`,
    expiresIn: ACCESS_TTL_S,
  };
}

export async function verifyOtp(body: OtpVerifyBody, now = Date.now()): Promise<OtpVerifyResponse> {
  const req = otpRequests.get(body.requestId);
  if (!req || req.expiresAt <= now) {
    otpRequests.delete(body.requestId);
    throw mockError('OTP_EXPIRED', 'Ce code a expiré. Demandez-en un nouveau.', 400);
  }
  if (req.attempts >= MAX_ATTEMPTS) {
    throw mockError('OTP_TOO_MANY_ATTEMPTS', 'Trop d’essais. Demandez un nouveau code.', 429);
  }
  if (body.code !== MOCK_OTP_CODE) {
    req.attempts += 1;
    const attemptsLeft = MAX_ATTEMPTS - req.attempts;
    if (attemptsLeft <= 0) {
      throw mockError('OTP_TOO_MANY_ATTEMPTS', 'Trop d’essais. Demandez un nouveau code.', 429);
    }
    throw mockError('OTP_INVALID', 'Code incorrect.', 400, { attemptsLeft });
  }
  otpRequests.delete(body.requestId);

  const db = await loadDb();
  let user = Object.values(db.users).find((u) => u.phone === req.phone);
  const isNewUser = !user;
  if (!user) {
    user = {
      id: newId('usr'),
      phone: req.phone,
      firstName: null,
      lastName: null,
      email: null,
      customerTypeId: null,
      segmentLabel: 'Particulier',
      customerTypePending: false,
      agencyId: null,
      consents: { marketing: false, termsVersion: null },
      profileComplete: false,
      createdAt: new Date(now).toISOString(),
    };
    await saveDb({ ...db, users: { ...db.users, [user.id]: user } });
  }
  return { ...(await issueTokens(user.id, now)), user, isNewUser };
}

export async function refreshSession(refreshToken: string, now = Date.now()) {
  const [kind, userId, nonce] = refreshToken.split('.');
  const db = await loadDb();
  if (kind !== 'mockR' || !userId || !db.users[userId] || db.refreshNonces[userId] !== nonce) {
    throw mockError('UNAUTHENTICATED', 'Session expirée. Reconnectez-vous.', 401);
  }
  return issueTokens(userId, now);
}

export async function logout(userId: string): Promise<void> {
  const db = await loadDb();
  const { [userId]: _revoked, ...refreshNonces } = db.refreshNonces;
  await saveDb({ ...db, refreshNonces });
}

/** Vérifie le jeton d'accès (401 si absent, invalide ou expiré). */
export async function requireUser(token: string | null, now = Date.now()): Promise<UserProfile> {
  const [kind, userId, exp] = (token ?? '').split('.');
  const db = await loadDb();
  const user = userId ? db.users[userId] : undefined;
  if (kind !== 'mockA' || !user || Number(exp) <= now) {
    throw mockError('UNAUTHENTICATED', 'Session expirée. Reconnectez-vous.', 401);
  }
  return user;
}

export async function updateProfile(user: UserProfile, body: ProfileUpdateBody): Promise<UserProfile> {
  const type = body.customerTypeId
    ? mockOnboardingOptions.customerTypes.find((t) => t.id === body.customerTypeId)
    : undefined;
  if (body.customerTypeId && !type) throw mockError('VALIDATION_ERROR', 'Type de client inconnu.', 422);
  if (body.agencyId && !mockOnboardingOptions.agencies.some((a) => a.id === body.agencyId)) {
    throw mockError('VALIDATION_ERROR', 'Agence inconnue.', 422);
  }

  const next: UserProfile = {
    ...user,
    ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
    ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
    ...(body.email !== undefined ? { email: body.email } : {}),
    ...(body.agencyId !== undefined ? { agencyId: body.agencyId } : {}),
    consents: {
      marketing: body.consents?.marketing ?? user.consents.marketing,
      termsVersion: body.consents?.termsVersion ?? user.consents.termsVersion,
    },
  };
  if (type) {
    next.customerTypeId = type.id;
    // Le segment tarifaire n'est attribué qu'après validation pour les types professionnels.
    next.customerTypePending = type.requiresReview;
    next.segmentLabel = type.requiresReview ? 'Particulier' : type.label;
  }
  next.profileComplete = isProfileComplete(next);

  const db = await loadDb();
  await saveDb({ ...db, users: { ...db.users, [next.id]: next } });
  return next;
}
