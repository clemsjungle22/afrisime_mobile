import type {
  AdminTeamCreate,
  AdminTeamCredentials,
  AdminTeamMember,
  AdminTeamUpdate,
} from '@afrisime/shared';
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { type AdminContext, type AdminRow, adminAudit } from './auth';
import { hashPassword, temporaryPassword } from './crypto';

/**
 * Comptes de l'équipe (administrateur seulement). Mots de passe provisoires montrés une seule fois ;
 * tout changement d'accès (rôle, désactivation, réinitialisation) ferme les sessions du compte.
 */

const invalid = (message: string, field?: string) =>
  new ApiError('VALIDATION_ERROR', message, field ? { field } : undefined, 422);

function toMember(a: AdminRow, selfId: string, now: Date): AdminTeamMember {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    role: a.role,
    status: a.status === 'active' ? 'active' : 'disabled',
    mustChangePassword: a.mustChangePassword,
    totpEnabled: a.totpSecret !== null,
    lockedUntil: a.lockedUntil && a.lockedUntil > now ? a.lockedUntil.toISOString() : null,
    lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    isSelf: a.id === selfId,
  };
}

export async function listTeam(db: Db, ctx: AdminContext, now = new Date()) {
  const rows = await db.select().from(s.adminUsers).orderBy(asc(s.adminUsers.name));
  // Comptes actifs d'abord, puis par nom.
  return rows
    .map((a) => toMember(a, ctx.admin.id, now))
    .sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active'));
}

async function load(db: Db, id: string) {
  const [a] = await db.select().from(s.adminUsers).where(eq(s.adminUsers.id, id));
  if (!a) throw new ApiError('NOT_FOUND', 'Compte introuvable.');
  return a;
}

const revokeSessions = (tx: Db, adminId: string, now: Date) =>
  tx
    .update(s.adminSessions)
    .set({ revokedAt: now })
    .where(and(eq(s.adminSessions.adminId, adminId), isNull(s.adminSessions.revokedAt)));

export async function createMember(
  db: Db,
  ctx: AdminContext,
  body: AdminTeamCreate,
  ip: string | null,
  now = new Date(),
): Promise<AdminTeamCredentials> {
  const [taken] = await db
    .select({ id: s.adminUsers.id })
    .from(s.adminUsers)
    .where(eq(s.adminUsers.email, body.email));
  if (taken) throw invalid('Un compte existe déjà avec cette adresse e-mail.', 'email');
  const password = temporaryPassword();
  const id = newId('adm');
  const [created] = await db
    .insert(s.adminUsers)
    .values({
      id,
      email: body.email,
      name: body.name,
      role: body.role,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  await adminAudit(db, {
    actorId: ctx.admin.id,
    action: 'admin.created',
    entityId: id,
    ip,
    after: { email: body.email, name: body.name, role: body.role },
  });
  return { member: toMember(created!, ctx.admin.id, now), temporaryPassword: password };
}

/** Changer le rôle ou désactiver / réactiver. Jamais soi-même, jamais le dernier administrateur actif. */
export async function updateMember(
  db: Db,
  ctx: AdminContext,
  id: string,
  body: AdminTeamUpdate,
  ip: string | null,
  now = new Date(),
): Promise<AdminTeamMember[]> {
  const before = await load(db, id);
  if (id === ctx.admin.id)
    throw invalid('Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte.');
  const role = body.role ?? before.role;
  const status = body.status ?? before.status;
  if (
    before.role === 'admin' &&
    before.status === 'active' &&
    (role !== 'admin' || status !== 'active')
  ) {
    const [others] = await db
      .select({ n: count() })
      .from(s.adminUsers)
      .where(
        and(
          eq(s.adminUsers.role, 'admin'),
          eq(s.adminUsers.status, 'active'),
          ne(s.adminUsers.id, id),
        ),
      );
    if (!others?.n) throw invalid('Il doit rester au moins un administrateur actif.');
  }
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    await tx
      .update(s.adminUsers)
      .set({ role, status, updatedAt: now })
      .where(eq(s.adminUsers.id, id));
    // Accès changé : reconnexion obligatoire (le nouveau rôle s'applique tout de suite).
    await revokeSessions(tx, id, now);
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action:
        status !== before.status
          ? status === 'active'
            ? 'admin.enabled'
            : 'admin.disabled'
          : 'admin.role_changed',
      entityId: id,
      ip,
      before: { role: before.role, status: before.status },
      after: { role, status },
    });
  });
  return listTeam(db, ctx, now);
}

/** Nouveau mot de passe provisoire (à changer à la connexion) ; sessions fermées, blocage levé. */
export async function resetPassword(
  db: Db,
  ctx: AdminContext,
  id: string,
  ip: string | null,
  now = new Date(),
): Promise<AdminTeamCredentials> {
  const member = await load(db, id);
  if (id === ctx.admin.id)
    throw invalid('Pour votre propre compte, utilisez « Mot de passe » en haut de page.');
  const password = temporaryPassword();
  const [updated] = await db
    .update(s.adminUsers)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
    })
    .where(eq(s.adminUsers.id, member.id))
    .returning();
  await revokeSessions(db, id, now);
  await adminAudit(db, { actorId: ctx.admin.id, action: 'admin.password_reset', entityId: id, ip });
  return { member: toMember(updated!, ctx.admin.id, now), temporaryPassword: password };
}

/** Téléphone perdu : la double authentification sera reconfigurée à la prochaine connexion. */
export async function resetTotp(
  db: Db,
  ctx: AdminContext,
  id: string,
  ip: string | null,
  now = new Date(),
): Promise<AdminTeamMember[]> {
  await load(db, id);
  if (id === ctx.admin.id) throw invalid('Vous ne pouvez pas réinitialiser votre propre 2FA.');
  await db
    .update(s.adminUsers)
    .set({ totpSecret: null, totpLastStep: null, updatedAt: now })
    .where(eq(s.adminUsers.id, id));
  await revokeSessions(db, id, now);
  await adminAudit(db, { actorId: ctx.admin.id, action: 'admin.totp_reset', entityId: id, ip });
  return listTeam(db, ctx, now);
}

/** Lever le blocage après trop d'essais de connexion. */
export async function unlockMember(
  db: Db,
  ctx: AdminContext,
  id: string,
  ip: string | null,
  now = new Date(),
): Promise<AdminTeamMember[]> {
  await load(db, id);
  await db
    .update(s.adminUsers)
    .set({ failedAttempts: 0, lockedUntil: null, updatedAt: now })
    .where(eq(s.adminUsers.id, id));
  await adminAudit(db, { actorId: ctx.admin.id, action: 'admin.unlocked', entityId: id, ip });
  return listTeam(db, ctx, now);
}
