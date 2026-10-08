import type { AdminRole } from '@afrisime/shared';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as loginRoute } from '@/app/v1/admin/auth/login/route';
import { POST as logoutRoute } from '@/app/v1/admin/auth/logout/route';
import { POST as confirmRoute } from '@/app/v1/admin/auth/totp/confirm/route';
import { POST as totpRoute } from '@/app/v1/admin/auth/totp/route';
import { POST as setupRoute } from '@/app/v1/admin/auth/totp/setup/route';
import { GET as dashboardRoute } from '@/app/v1/admin/dashboard/route';
import { POST as passwordRoute } from '@/app/v1/admin/me/password/route';
import { GET as meRoute } from '@/app/v1/admin/me/route';
import { GET as customerMeRoute } from '@/app/v1/me/route';
import {
  LOCK_MS,
  MAX_FAILED_LOGINS,
  SESSION_IDLE_MS,
  authenticateAdmin,
  login,
  startTotpSetup,
  verifyLoginTotp,
  confirmTotpSetup,
} from '@/server/admin/auth';
import {
  decrypt,
  encrypt,
  hashPassword,
  totpCode,
  totpStep,
  verifyPassword,
  verifyTotp,
} from '@/server/admin/crypto';
import { getDashboard } from '@/server/admin/dashboard';
import { createSession } from '@/server/auth/sessions';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
let seq = 0;
const PASSWORD = 'mot-de-passe-solide-2026';
const client = { ip: '10.9.9.9', userAgent: 'vitest' };

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
});
afterAll(async () => {
  setDb(null);
  await t.close();
});

/** Compte de l'équipe prêt à l'emploi (mot de passe définitif, sans 2FA sauf si demandé). */
async function newAdmin(
  role: AdminRole = 'orders',
  options: { totp?: string; mustChange?: boolean } = {},
) {
  const id = `adm_t${++seq}`;
  const email = `equipe${seq}@afrisime.tg`;
  await t.db.insert(s.adminUsers).values({
    id,
    email,
    name: `Équipe ${seq}`,
    role,
    passwordHash: await hashPassword(PASSWORD),
    mustChangePassword: options.mustChange ?? false,
    totpSecret: options.totp ? encrypt(options.totp) : null,
  });
  return { id, email };
}

async function tokenFor(role: AdminRole = 'orders', mustChange = false) {
  const { email } = await newAdmin(role, { mustChange });
  const res = await login(t.db, { email, password: PASSWORD }, client);
  if (res.status !== 'authenticated') throw new Error(res.status);
  return res.token;
}

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe('briques de sécurité', () => {
  it('mot de passe : empreinte salée, vérification', async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    expect(a).not.toBe(b);
    expect(a).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword('autre', a)).toBe(false);
  });

  it('code 2FA conforme à la RFC 6238 (vecteur de test officiel)', () => {
    // Secret « 12345678901234567890 » en base32, T = 59 s → 287082 (6 derniers chiffres de 94287082).
    expect(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 1)).toBe('287082');
  });

  it('code 2FA : accepté à ±30 s, refusé au-delà', () => {
    const now = new Date('2026-10-08T10:00:00Z');
    const code = totpCode(SECRET, totpStep(now));
    expect(verifyTotp(SECRET, code, now)).toBe(totpStep(now));
    expect(verifyTotp(SECRET, code, new Date(now.getTime() + 30_000))).not.toBeNull();
    expect(verifyTotp(SECRET, code, new Date(now.getTime() + 90_000))).toBeNull();
  });

  it('secret 2FA chiffré au repos', () => {
    const sealed = encrypt(SECRET);
    expect(sealed).not.toContain(SECRET);
    expect(decrypt(sealed)).toBe(SECRET);
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe('connexion', () => {
  it('sans 2FA (rôle non administrateur) : session ouverte, profil, audit', async () => {
    const { id, email } = await newAdmin('orders');
    const res = await call(loginRoute, 'POST', '/v1/admin/auth/login', {
      body: { email: email.toUpperCase(), password: PASSWORD },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'authenticated',
      admin: { email, role: 'orders', totpEnabled: false },
    });
    const me = await call(meRoute, 'GET', '/v1/admin/me', { token: res.body.token });
    expect(me.body.id).toBe(id);
    const audit = await t.db
      .select()
      .from(s.auditLog)
      .where(and(eq(s.auditLog.entityId, id), eq(s.auditLog.action, 'admin.login_succeeded')));
    expect(audit).toHaveLength(1);
  });

  it('mauvais mot de passe ou e-mail inconnu : même message', async () => {
    const { email } = await newAdmin();
    const wrong = await call(loginRoute, 'POST', '/v1/admin/auth/login', {
      body: { email, password: 'faux' },
    });
    const unknown = await call(loginRoute, 'POST', '/v1/admin/auth/login', {
      body: { email: 'inconnu@afrisime.tg', password: 'faux' },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it(`bloqué ${LOCK_MS / 60_000} min après ${MAX_FAILED_LOGINS} échecs, même avec le bon mot de passe`, async () => {
    const { email } = await newAdmin();
    const now = new Date();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await expect(
        login(t.db, { email, password: 'faux' }, { ...client, ip: `1.0.0.${i}` }, now),
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
    await expect(login(t.db, { email, password: PASSWORD }, client, now)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    const later = new Date(now.getTime() + LOCK_MS + 1000);
    await expect(login(t.db, { email, password: PASSWORD }, client, later)).resolves.toMatchObject({
      status: 'authenticated',
    });
  });

  it('administrateur sans 2FA : activation imposée (QR code), puis session', async () => {
    const { id, email } = await newAdmin('admin');
    const now = new Date('2026-10-08T10:00:00Z');
    const res = await login(t.db, { email, password: PASSWORD }, client, now);
    expect(res.status).toBe('totp_setup_required');
    const challengeId = (res as { challengeId: string }).challengeId;

    const setup = await call(setupRoute, 'POST', '/v1/admin/auth/totp/setup', {
      body: { challengeId },
    });
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/AfriSime/);
    // Recharger l'écran redonne le même secret (QR déjà scanné toujours valable).
    expect((await startTotpSetup(t.db, challengeId, now)).secret).toBe(setup.body.secret);

    const wrong = await call(confirmRoute, 'POST', '/v1/admin/auth/totp/confirm', {
      body: { challengeId, code: '000000' },
    });
    expect(wrong.body.error).toMatchObject({ code: 'OTP_INVALID', details: { attemptsLeft: 4 } });
    const session = await confirmTotpSetup(
      t.db,
      { challengeId, code: totpCode(setup.body.secret, totpStep(now)) },
      client,
      now,
    );
    expect(session.admin.totpEnabled).toBe(true);
    const [row] = await t.db.select().from(s.adminUsers).where(eq(s.adminUsers.id, id));
    expect(row?.totpSecret).not.toContain(setup.body.secret);
  });

  it('2FA activé : code demandé ; faux code compté ; un code ne sert qu’une fois', async () => {
    const { email } = await newAdmin('admin', { totp: SECRET });
    const now = new Date('2026-10-08T11:00:00Z');
    const first = await login(t.db, { email, password: PASSWORD }, client, now);
    expect(first.status).toBe('totp_required');
    const challengeId = (first as { challengeId: string }).challengeId;

    const bad = await call(totpRoute, 'POST', '/v1/admin/auth/totp', {
      body: { challengeId, code: '000000' },
    });
    expect(bad.body.error).toMatchObject({ code: 'OTP_INVALID', details: { attemptsLeft: 4 } });

    const code = totpCode(SECRET, totpStep(now));
    await expect(verifyLoginTotp(t.db, { challengeId, code }, client, now)).resolves.toMatchObject({
      status: 'authenticated',
    });
    // Même étape réutilisée → refusée.
    await expect(verifyLoginTotp(t.db, { challengeId, code }, client, now)).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
    // Nouvelle connexion avec le même code (rejeu) → refusée.
    const second = await login(t.db, { email, password: PASSWORD }, client, now);
    await expect(
      verifyLoginTotp(
        t.db,
        { challengeId: (second as { challengeId: string }).challengeId, code },
        client,
        now,
      ),
    ).rejects.toMatchObject({ code: 'OTP_INVALID' });
  });

  it('étape 2FA expirée après 5 minutes', async () => {
    const { email } = await newAdmin('admin', { totp: SECRET });
    const now = new Date('2026-10-08T12:00:00Z');
    const res = (await login(t.db, { email, password: PASSWORD }, client, now)) as {
      challengeId: string;
    };
    const later = new Date(now.getTime() + 6 * 60_000);
    await expect(
      verifyLoginTotp(
        t.db,
        { challengeId: res.challengeId, code: totpCode(SECRET, totpStep(later)) },
        client,
        later,
      ),
    ).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });
});

describe('sessions et droits', () => {
  it('déconnexion : le jeton est refusé ensuite', async () => {
    const token = await tokenFor();
    expect((await call(logoutRoute, 'POST', '/v1/admin/auth/logout', { token })).status).toBe(204);
    expect((await call(meRoute, 'GET', '/v1/admin/me', { token })).status).toBe(401);
  });

  it('session fermée après 2 h sans activité', async () => {
    const token = await tokenFor();
    const req = new Request('http://x', { headers: { authorization: `Bearer ${token}` } });
    await expect(
      authenticateAdmin(t.db, req, new Date(Date.now() + SESSION_IDLE_MS + 60_000)),
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('jeton client refusé au back-office, jeton équipe refusé côté client', async () => {
    await t.db
      .insert(s.customers)
      .values({ id: 'usr_adm_test', phone: '+22891234567' })
      .onConflictDoNothing();
    const customer = await createSession(t.db, 'usr_adm_test', null);
    expect(
      (await call(meRoute, 'GET', '/v1/admin/me', { token: customer.accessToken })).status,
    ).toBe(401);
    const admin = await tokenFor();
    expect((await call(customerMeRoute, 'GET', '/v1/me', { token: admin })).status).toBe(401);
  });

  it('mot de passe provisoire : tout est bloqué sauf le changement de mot de passe', async () => {
    const token = await tokenFor('orders', true);
    const blocked = await call(dashboardRoute, 'GET', '/v1/admin/dashboard', { token });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.details).toEqual({ reason: 'password_change_required' });

    const weak = await call(passwordRoute, 'POST', '/v1/admin/me/password', {
      token,
      body: { currentPassword: PASSWORD, newPassword: 'court' },
    });
    expect(weak.status).toBe(400);
    const wrong = await call(passwordRoute, 'POST', '/v1/admin/me/password', {
      token,
      body: { currentPassword: 'faux', newPassword: 'nouveau-mot-de-passe-2026' },
    });
    expect(wrong.status).toBe(422);
    const ok = await call(passwordRoute, 'POST', '/v1/admin/me/password', {
      token,
      body: { currentPassword: PASSWORD, newPassword: 'nouveau-mot-de-passe-2026' },
    });
    expect(ok.body.mustChangePassword).toBe(false);
    expect((await call(dashboardRoute, 'GET', '/v1/admin/dashboard', { token })).status).toBe(200);
  });

  it('changer de mot de passe ferme les autres sessions', async () => {
    const { email } = await newAdmin();
    const a = (await login(t.db, { email, password: PASSWORD }, client)) as { token: string };
    const b = (await login(t.db, { email, password: PASSWORD }, client)) as { token: string };
    await call(passwordRoute, 'POST', '/v1/admin/me/password', {
      token: a.token,
      body: { currentPassword: PASSWORD, newPassword: 'encore-un-autre-2026' },
    });
    expect((await call(meRoute, 'GET', '/v1/admin/me', { token: a.token })).status).toBe(200);
    expect((await call(meRoute, 'GET', '/v1/admin/me', { token: b.token })).status).toBe(401);
  });

  it('lecture seule : le tableau de bord est accessible', async () => {
    expect(
      (
        await call(dashboardRoute, 'GET', '/v1/admin/dashboard', {
          token: await tokenFor('readonly'),
        })
      ).status,
    ).toBe(200);
  });
});

describe('tableau de bord', () => {
  it('ruptures, comptes pro en attente, commandes du jour', async () => {
    await t.db
      .update(s.customers)
      .set({ customerTypePending: true })
      .where(eq(s.customers.id, 'usr_kossi'));
    const d = await getDashboard(t.db);
    // Données d'exemple : les cubes d'assaisonnement sont en rupture (0) ; les stocks limités sont sous leur seuil.
    expect(d.lowStock.map((l) => l.variantId)).toContain('var_cubes-assaisonnement_0');
    expect(d.lowStock.find((l) => l.variantId === 'var_cubes-assaisonnement_0')?.sellable).toBe(0);
    expect(d.pendingProAccounts).toBe(1);
    expect(d.ordersToday).toBe(0);
    expect(d.revenueToday).toBe(0);
  });
});
