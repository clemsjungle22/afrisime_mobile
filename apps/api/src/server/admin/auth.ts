import {
  type AdminChangePasswordBody,
  type AdminLoginBody,
  type AdminLoginResponse,
  type AdminProfile,
  type AdminSession,
  type AdminTotpSetupResponse,
  ROLES_REQUIRING_TOTP,
} from '@afrisime/shared';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomSecret, safeEqual, sha256 } from '../auth/tokens';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { log } from '../log';
import {
  burnPasswordCheck,
  decrypt,
  encrypt,
  hashPassword,
  newTotpSecret,
  otpauthUri,
  verifyPassword,
  verifyTotp,
} from './crypto';

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60_000;
/** Plafond d'échecs par adresse IP sur 15 min (tous comptes confondus). */
export const MAX_FAILURES_PER_IP = 20;
export const CHALLENGE_TTL_MS = 5 * 60_000;
export const MAX_TOTP_ATTEMPTS = 5;
/** Session : fermée après 2 h sans activité, et au bout de 12 h dans tous les cas. */
export const SESSION_IDLE_MS = 2 * 3_600_000;
export const SESSION_MAX_MS = 12 * 3_600_000;

export type AdminRow = typeof s.adminUsers.$inferSelect;
export type AdminContext = { admin: AdminRow; sessionId: string };
type Client = { ip: string; userAgent: string | null };

const badCredentials = () => new ApiError('UNAUTHENTICATED', 'E-mail ou mot de passe incorrect.');
const sessionExpired = () => new ApiError('UNAUTHENTICATED', 'Session expirée. Reconnectez-vous.');
const challengeExpired = () =>
  new ApiError('OTP_EXPIRED', 'Cette étape a expiré. Reconnectez-vous.');

export function toAdminProfile(a: AdminRow): AdminProfile {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    role: a.role,
    totpEnabled: a.totpSecret !== null,
    mustChangePassword: a.mustChangePassword,
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
  };
}

/** Journal d'audit des actions de l'équipe (ajout seul). */
export async function adminAudit(
  db: Db,
  entry: {
    actorId: string | null;
    action: string;
    entityId: string;
    ip?: string | null;
    before?: unknown;
    after?: unknown;
    entity?: string;
  },
) {
  await db.insert(s.auditLog).values({
    actorType: 'admin',
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity ?? 'admin_user',
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
  });
}

// ─── Sessions ────────────────────────────────────────────────────────────────

async function openSession(
  db: Db,
  admin: AdminRow,
  client: Client,
  now: Date,
): Promise<AdminSession> {
  const id = newId('ads');
  const secret = randomSecret();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_MS);
  await db.insert(s.adminSessions).values({
    id,
    adminId: admin.id,
    tokenHash: sha256(secret),
    ip: client.ip,
    userAgent: client.userAgent,
    createdAt: now,
    lastUsedAt: now,
    expiresAt,
  });
  const [updated] = await db
    .update(s.adminUsers)
    .set({ lastLoginAt: now, failedAttempts: 0, lockedUntil: null, updatedAt: now })
    .where(eq(s.adminUsers.id, admin.id))
    .returning();
  await adminAudit(db, {
    actorId: admin.id,
    action: 'admin.login_succeeded',
    entityId: admin.id,
    ip: client.ip,
  });
  return {
    status: 'authenticated',
    token: `${id}.${secret}`,
    expiresAt: expiresAt.toISOString(),
    admin: toAdminProfile(updated!),
  };
}

/** Membre de l'équipe d'après le jeton (en-tête Authorization), ou erreur 401. */
export async function authenticateAdmin(
  db: Db,
  req: Request,
  now = new Date(),
): Promise<AdminContext> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  const [id, secret] = (match?.[1] ?? '').split('.');
  if (!id || !secret) throw sessionExpired();

  const [row] = await db
    .select({ session: s.adminSessions, admin: s.adminUsers })
    .from(s.adminSessions)
    .innerJoin(s.adminUsers, eq(s.adminUsers.id, s.adminSessions.adminId))
    .where(
      and(
        eq(s.adminSessions.id, id),
        isNull(s.adminSessions.revokedAt),
        gt(s.adminSessions.expiresAt, now),
      ),
    )
    .limit(1);
  if (!row || !safeEqual(sha256(secret), row.session.tokenHash)) throw sessionExpired();
  if (row.admin.status !== 'active') throw sessionExpired();
  if (now.getTime() - row.session.lastUsedAt.getTime() > SESSION_IDLE_MS) {
    await db.update(s.adminSessions).set({ revokedAt: now }).where(eq(s.adminSessions.id, id));
    throw sessionExpired();
  }
  // Activité enregistrée au plus une fois par minute (évite une écriture à chaque requête).
  if (now.getTime() - row.session.lastUsedAt.getTime() > 60_000) {
    await db.update(s.adminSessions).set({ lastUsedAt: now }).where(eq(s.adminSessions.id, id));
  }
  return { admin: row.admin, sessionId: id };
}

export async function logout(db: Db, ctx: AdminContext, ip: string, now = new Date()) {
  await db
    .update(s.adminSessions)
    .set({ revokedAt: now })
    .where(eq(s.adminSessions.id, ctx.sessionId));
  await adminAudit(db, {
    actorId: ctx.admin.id,
    action: 'admin.logout',
    entityId: ctx.admin.id,
    ip,
  });
}

// ─── Connexion ───────────────────────────────────────────────────────────────

async function tooManyFailuresFrom(db: Db, ip: string, now: Date) {
  const [row] = await db
    .select({ n: count() })
    .from(s.auditLog)
    .where(
      and(
        eq(s.auditLog.action, 'admin.login_failed'),
        eq(s.auditLog.ip, ip),
        gt(s.auditLog.at, new Date(now.getTime() - LOCK_MS)),
      ),
    );
  return (row?.n ?? 0) >= MAX_FAILURES_PER_IP;
}

async function newChallenge(
  db: Db,
  admin: AdminRow,
  kind: 'totp' | 'totp_setup',
  ip: string,
  now: Date,
) {
  const id = newId('adc');
  await db.insert(s.adminChallenges).values({
    id,
    adminId: admin.id,
    kind,
    ip,
    createdAt: now,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
  });
  return id;
}

export async function login(
  db: Db,
  body: AdminLoginBody,
  client: Client,
  now = new Date(),
): Promise<AdminLoginResponse> {
  if (await tooManyFailuresFrom(db, client.ip, now)) {
    throw new ApiError(
      'RATE_LIMITED',
      'Trop de tentatives depuis cet appareil. Réessayez dans 15 minutes.',
      { retryIn: LOCK_MS / 1000 },
    );
  }
  const [admin] = await db.select().from(s.adminUsers).where(eq(s.adminUsers.email, body.email));

  if (!admin || admin.status !== 'active') {
    await burnPasswordCheck(body.password);
    await adminAudit(db, {
      actorId: null,
      action: 'admin.login_failed',
      entityId: body.email,
      ip: client.ip,
    });
    throw badCredentials();
  }
  if (admin.lockedUntil && admin.lockedUntil > now) {
    const minutes = Math.ceil((admin.lockedUntil.getTime() - now.getTime()) / 60_000);
    throw new ApiError(
      'RATE_LIMITED',
      `Compte bloqué après plusieurs échecs. Réessayez dans ${minutes} min.`,
      {
        retryIn: minutes * 60,
      },
    );
  }
  if (!(await verifyPassword(body.password, admin.passwordHash))) {
    const failed = admin.failedAttempts + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db
      .update(s.adminUsers)
      .set({
        failedAttempts: lock ? 0 : failed,
        lockedUntil: lock ? new Date(now.getTime() + LOCK_MS) : null,
        updatedAt: now,
      })
      .where(eq(s.adminUsers.id, admin.id));
    await adminAudit(db, {
      actorId: admin.id,
      action: 'admin.login_failed',
      entityId: admin.id,
      ip: client.ip,
    });
    if (lock) {
      await adminAudit(db, {
        actorId: admin.id,
        action: 'admin.locked',
        entityId: admin.id,
        ip: client.ip,
      });
      log.warn('compte équipe bloqué après plusieurs échecs', { adminId: admin.id, ip: client.ip });
    }
    throw badCredentials();
  }

  if (admin.totpSecret)
    return {
      status: 'totp_required',
      challengeId: await newChallenge(db, admin, 'totp', client.ip, now),
    };
  if (ROLES_REQUIRING_TOTP.has(admin.role)) {
    return {
      status: 'totp_setup_required',
      challengeId: await newChallenge(db, admin, 'totp_setup', client.ip, now),
    };
  }
  return openSession(db, admin, client, now);
}

/** Étape en cours, encore valable et non utilisée, avec son compte. */
async function liveChallenge(db: Db, challengeId: string, kind: 'totp' | 'totp_setup', now: Date) {
  const [row] = await db
    .select({ challenge: s.adminChallenges, admin: s.adminUsers })
    .from(s.adminChallenges)
    .innerJoin(s.adminUsers, eq(s.adminUsers.id, s.adminChallenges.adminId))
    .where(and(eq(s.adminChallenges.id, challengeId), eq(s.adminChallenges.kind, kind)));
  if (
    !row ||
    row.challenge.consumedAt ||
    row.challenge.expiresAt <= now ||
    row.admin.status !== 'active'
  ) {
    throw challengeExpired();
  }
  if (row.challenge.attempts >= MAX_TOTP_ATTEMPTS)
    throw new ApiError('OTP_TOO_MANY_ATTEMPTS', "Trop d'essais. Reconnectez-vous.");
  return row;
}

/** Code faux : compte l'essai et renvoie l'erreur avec les essais restants. */
async function wrongCode(db: Db, challengeId: string): Promise<never> {
  const [row] = await db
    .update(s.adminChallenges)
    .set({ attempts: sql`${s.adminChallenges.attempts} + 1` })
    .where(eq(s.adminChallenges.id, challengeId))
    .returning({ attempts: s.adminChallenges.attempts });
  const attemptsLeft = MAX_TOTP_ATTEMPTS - (row?.attempts ?? MAX_TOTP_ATTEMPTS);
  if (attemptsLeft <= 0)
    throw new ApiError('OTP_TOO_MANY_ATTEMPTS', "Trop d'essais. Reconnectez-vous.");
  throw new ApiError('OTP_INVALID', 'Code incorrect.', { attemptsLeft });
}

/** Consomme l'étape une seule fois (deux envois simultanés : un seul ouvre une session). */
async function consume(db: Db, challengeId: string, now: Date) {
  const done = await db
    .update(s.adminChallenges)
    .set({ consumedAt: now })
    .where(and(eq(s.adminChallenges.id, challengeId), isNull(s.adminChallenges.consumedAt)))
    .returning({ id: s.adminChallenges.id });
  if (done.length === 0) throw challengeExpired();
}

/** Accepte un pas 2FA seulement s'il est plus récent que le dernier utilisé (un code ne sert qu'une fois). */
async function acceptStep(db: Db, adminId: string, step: number): Promise<boolean> {
  const updated = await db
    .update(s.adminUsers)
    .set({ totpLastStep: step })
    .where(
      and(eq(s.adminUsers.id, adminId), sql`coalesce(${s.adminUsers.totpLastStep}, -1) < ${step}`),
    )
    .returning({ id: s.adminUsers.id });
  return updated.length > 0;
}

export async function verifyLoginTotp(
  db: Db,
  body: { challengeId: string; code: string },
  client: Client,
  now = new Date(),
): Promise<AdminSession> {
  const { admin } = await liveChallenge(db, body.challengeId, 'totp', now);
  const step = admin.totpSecret ? verifyTotp(decrypt(admin.totpSecret), body.code, now) : null;
  if (step === null || !(await acceptStep(db, admin.id, step)))
    return wrongCode(db, body.challengeId);
  await consume(db, body.challengeId, now);
  return openSession(db, admin, client, now);
}

// ─── Activation du 2FA (pendant la connexion) ────────────────────────────────

export async function startTotpSetup(
  db: Db,
  challengeId: string,
  now = new Date(),
): Promise<AdminTotpSetupResponse> {
  const { admin, challenge } = await liveChallenge(db, challengeId, 'totp_setup', now);
  // Le même secret est renvoyé si l'écran est rechargé (le QR déjà scanné reste valable).
  const secret = challenge.pendingSecret ? decrypt(challenge.pendingSecret) : newTotpSecret();
  if (!challenge.pendingSecret) {
    await db
      .update(s.adminChallenges)
      .set({ pendingSecret: encrypt(secret) })
      .where(eq(s.adminChallenges.id, challengeId));
  }
  return { otpauthUri: otpauthUri(secret, admin.email), secret };
}

export async function confirmTotpSetup(
  db: Db,
  body: { challengeId: string; code: string },
  client: Client,
  now = new Date(),
): Promise<AdminSession> {
  const { admin, challenge } = await liveChallenge(db, body.challengeId, 'totp_setup', now);
  if (!challenge.pendingSecret)
    throw new ApiError('VALIDATION_ERROR', "Affichez d'abord le QR code.", undefined, 422);
  const step = verifyTotp(decrypt(challenge.pendingSecret), body.code, now);
  if (step === null) return wrongCode(db, body.challengeId);
  await consume(db, body.challengeId, now);
  const [enabled] = await db
    .update(s.adminUsers)
    .set({ totpSecret: challenge.pendingSecret, totpLastStep: step, updatedAt: now })
    .where(eq(s.adminUsers.id, admin.id))
    .returning();
  await adminAudit(db, {
    actorId: admin.id,
    action: 'admin.totp_enabled',
    entityId: admin.id,
    ip: client.ip,
  });
  return openSession(db, enabled!, client, now);
}

// ─── Mot de passe ────────────────────────────────────────────────────────────

/** Changement de mot de passe : les autres sessions de ce compte sont fermées. */
export async function changePassword(
  db: Db,
  ctx: AdminContext,
  body: AdminChangePasswordBody,
  ip: string,
  now = new Date(),
) {
  if (!(await verifyPassword(body.currentPassword, ctx.admin.passwordHash))) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Mot de passe actuel incorrect.',
      { field: 'currentPassword' },
      422,
    );
  }
  const [updated] = await db
    .update(s.adminUsers)
    .set({
      passwordHash: await hashPassword(body.newPassword),
      mustChangePassword: false,
      updatedAt: now,
    })
    .where(eq(s.adminUsers.id, ctx.admin.id))
    .returning();
  await db
    .update(s.adminSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(s.adminSessions.adminId, ctx.admin.id),
        isNull(s.adminSessions.revokedAt),
        sql`${s.adminSessions.id} <> ${ctx.sessionId}`,
      ),
    );
  await adminAudit(db, {
    actorId: ctx.admin.id,
    action: 'admin.password_changed',
    entityId: ctx.admin.id,
    ip,
  });
  return toAdminProfile(updated!);
}
