import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as logoutRoute } from '@/app/v1/auth/logout/route';
import { POST as requestRoute } from '@/app/v1/auth/otp/request/route';
import { POST as verifyRoute } from '@/app/v1/auth/otp/verify/route';
import { POST as refreshRoute } from '@/app/v1/auth/refresh/route';
import { GET as meRoute } from '@/app/v1/me/route';
import { MAX_PER_IP_PER_HOUR, MAX_PER_PHONE_PER_HOUR, OTP_TTL_S, requestOtp, verifyOtp } from '@/server/auth/otp';
import { refreshSession } from '@/server/auth/sessions';
import { ACCESS_TTL_S, signAccessToken } from '@/server/auth/tokens';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { resetEnvCache } from '@/server/env';
import { setSmsSender } from '@/server/sms';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
const sms: { to: string; text: string }[] = [];
const lastCode = () => /(\d{6})/.exec(sms.at(-1)?.text ?? '')?.[1] ?? '';

const DEVICE = { platform: 'android', model: 'Tecno Spark', osVersion: '14', appVersion: '1.0.0' } as const;
let phoneSeq = 0;
/** Un numéro neuf par test : les plafonds par numéro ne se mélangent pas. */
const freshPhone = () => `+2289${String(1000000 + ++phoneSeq).slice(-7)}`;
/** Une IP neuve par test, pour la même raison. */
let ipSeq = 0;
const freshIp = () => ({ 'x-forwarded-for': `10.0.0.${++ipSeq}` });

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  setSmsSender({ send: async (to, text) => void sms.push({ to, text }) });
});
afterAll(async () => {
  setSmsSender(null);
  setDb(null);
  await t.close();
});
beforeEach(() => {
  delete process.env.OTP_DEV_CODE;
  resetEnvCache();
});

async function login(phone = freshPhone()) {
  const headers = freshIp();
  const req = await call(requestRoute, 'POST', '/v1/auth/otp/request', { body: { phone }, headers });
  expect(req.status).toBe(200);
  const res = await call(verifyRoute, 'POST', '/v1/auth/otp/verify', {
    body: { requestId: req.body.requestId, code: lastCode(), device: DEVICE },
    headers,
  });
  expect(res.status).toBe(200);
  return res.body as { accessToken: string; refreshToken: string; isNewUser: boolean; user: { id: string } };
}

describe('connexion par code', () => {
  it('parcours complet : code par SMS, compte créé, jetons et profil', async () => {
    const phone = freshPhone();
    const req = await call(requestRoute, 'POST', '/v1/auth/otp/request', { body: { phone }, headers: freshIp() });
    expect(req.body).toEqual({ requestId: expect.stringMatching(/^otp_/), expiresIn: OTP_TTL_S, resendIn: 30 });
    expect(sms.at(-1)?.to).toBe(phone);
    expect(lastCode()).toMatch(/^\d{6}$/);

    const res = await call(verifyRoute, 'POST', '/v1/auth/otp/verify', {
      body: { requestId: req.body.requestId, code: lastCode(), device: DEVICE },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isNewUser: true, expiresIn: ACCESS_TTL_S, user: { phone, profileComplete: false } });

    const me = await call(meRoute, 'GET', '/v1/me', { token: res.body.accessToken });
    expect(me.body.id).toBe(res.body.user.id);
  });

  it('le compte existant est retrouvé (isNewUser = false)', async () => {
    const phone = freshPhone();
    const first = await login(phone);
    // Deuxième connexion une fois le délai entre deux demandes écoulé.
    const later = new Date(Date.now() + 31_000);
    const { requestId } = await requestOtp(t.db, phone, '5.5.5.5', later);
    const again = await verifyOtp(t.db, { requestId, code: lastCode(), device: DEVICE }, '5.5.5.5', later);
    expect(again.isNewUser).toBe(false);
    expect(again.user.id).toBe(first.user.id);
  });

  it("le compte de démonstration se connecte avec son numéro", async () => {
    const res = await login('+22890000001');
    expect(res).toMatchObject({ isNewUser: false, user: { id: 'usr_kossi', profileComplete: true } });
  });

  it('le code n’est jamais stocké en clair', async () => {
    const phone = freshPhone();
    await call(requestRoute, 'POST', '/v1/auth/otp/request', { body: { phone }, headers: freshIp() });
    const [row] = await t.db.select().from(s.otpRequests).where(eq(s.otpRequests.phone, phone));
    expect(row?.codeHash).not.toContain(lastCode());
  });

  it('code faux → OTP_INVALID avec les essais restants, puis blocage au 5e', async () => {
    const { requestId } = await requestOtp(t.db, freshPhone(), '1.1.1.1');
    const wrong = lastCode() === '000000' ? '111111' : '000000';
    for (let left = 4; left >= 1; left--) {
      const res = await call(verifyRoute, 'POST', '/v1/auth/otp/verify', { body: { requestId, code: wrong, device: DEVICE } });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'OTP_INVALID', details: { attemptsLeft: left } });
    }
    const fifth = await call(verifyRoute, 'POST', '/v1/auth/otp/verify', { body: { requestId, code: wrong, device: DEVICE } });
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    // Même le bon code est refusé ensuite.
    const right = await call(verifyRoute, 'POST', '/v1/auth/otp/verify', { body: { requestId, code: lastCode(), device: DEVICE } });
    expect(right.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('code expiré → OTP_EXPIRED', async () => {
    const now = new Date();
    const { requestId } = await requestOtp(t.db, freshPhone(), '1.1.1.2', now);
    const later = new Date(now.getTime() + (OTP_TTL_S + 1) * 1000);
    await expect(verifyOtp(t.db, { requestId, code: lastCode(), device: DEVICE }, '1.1.1.2', later)).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });

  it('un code ne sert qu’une fois', async () => {
    const { requestId } = await requestOtp(t.db, freshPhone(), '1.1.1.3');
    const code = lastCode();
    await verifyOtp(t.db, { requestId, code, device: DEVICE }, '1.1.1.3');
    await expect(verifyOtp(t.db, { requestId, code, device: DEVICE }, '1.1.1.3')).rejects.toMatchObject({ code: 'OTP_EXPIRED' });
  });

  it('nouvelle demande trop tôt → RATE_LIMITED avec le délai (et Retry-After)', async () => {
    const phone = freshPhone();
    const headers = freshIp();
    await call(requestRoute, 'POST', '/v1/auth/otp/request', { body: { phone }, headers });
    const res = await call(requestRoute, 'POST', '/v1/auth/otp/request', { body: { phone }, headers });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatchObject({ code: 'RATE_LIMITED', details: { retryIn: expect.any(Number) } });
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it(`plafond par numéro : ${MAX_PER_PHONE_PER_HOUR} demandes par heure`, async () => {
    const phone = freshPhone();
    const start = Date.now();
    for (let i = 0; i < MAX_PER_PHONE_PER_HOUR; i++) {
      await requestOtp(t.db, phone, `2.2.2.${i}`, new Date(start + i * 31_000));
    }
    await expect(requestOtp(t.db, phone, '2.2.2.99', new Date(start + 10 * 31_000))).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    // Une heure plus tard, c'est de nouveau possible.
    await expect(requestOtp(t.db, phone, '2.2.2.98', new Date(start + 3_700_000))).resolves.toBeDefined();
  });

  it(`plafond par IP : ${MAX_PER_IP_PER_HOUR} demandes par heure`, async () => {
    const ip = '3.3.3.3';
    for (let i = 0; i < MAX_PER_IP_PER_HOUR; i++) await requestOtp(t.db, freshPhone(), ip);
    await expect(requestOtp(t.db, freshPhone(), ip)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('numéro invalide → 400 VALIDATION_ERROR', async () => {
    const res = await call(requestRoute, 'POST', '/v1/auth/otp/request', { body: { phone: '+33612345678' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('code fixe de développement (OTP_DEV_CODE)', async () => {
    process.env.OTP_DEV_CODE = '123456';
    resetEnvCache();
    await requestOtp(t.db, freshPhone(), '4.4.4.4');
    expect(lastCode()).toBe('123456');
  });
});

describe('sessions', () => {
  it('renouvellement : nouveaux jetons, l’ancien jeton de renouvellement ne marche plus', async () => {
    const tokens = await login();
    const res = await call(refreshRoute, 'POST', '/v1/auth/refresh', { body: { refreshToken: tokens.refreshToken } });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(tokens.refreshToken);
    expect((await call(meRoute, 'GET', '/v1/me', { token: res.body.accessToken })).status).toBe(200);
  });

  it('ancien jeton réutilisé → la session est fermée (vol présumé)', async () => {
    const tokens = await login();
    const rotated = await refreshSession(t.db, tokens.refreshToken);
    await expect(refreshSession(t.db, tokens.refreshToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    // Le jeton légitime, lui aussi, est désormais refusé : il faut se reconnecter.
    await expect(refreshSession(t.db, rotated.refreshToken)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect((await call(meRoute, 'GET', '/v1/me', { token: rotated.accessToken })).status).toBe(401);
  });

  it('déconnexion : 204, puis le jeton d’accès et le renouvellement sont refusés', async () => {
    const tokens = await login();
    const out = await call(logoutRoute, 'POST', '/v1/auth/logout', { token: tokens.accessToken });
    expect(out.status).toBe(204);
    expect((await call(meRoute, 'GET', '/v1/me', { token: tokens.accessToken })).status).toBe(401);
    expect((await call(refreshRoute, 'POST', '/v1/auth/refresh', { body: { refreshToken: tokens.refreshToken } })).status).toBe(401);
  });

  it('jeton absent, falsifié ou expiré → 401 UNAUTHENTICATED', async () => {
    const tokens = await login();
    expect((await call(meRoute, 'GET', '/v1/me')).status).toBe(401);
    const forged = `${tokens.accessToken.slice(0, -4)}AAAA`;
    expect((await call(meRoute, 'GET', '/v1/me', { token: forged })).body.error.code).toBe('UNAUTHENTICATED');
    const [session] = await t.db.select().from(s.sessions).where(eq(s.sessions.customerId, tokens.user.id));
    const old = await signAccessToken(tokens.user.id, session!.id, new Date(Date.now() - (ACCESS_TTL_S + 60) * 1000));
    expect((await call(meRoute, 'GET', '/v1/me', { token: old })).status).toBe(401);
  });

  it('jeton de renouvellement inconnu → 401', async () => {
    const res = await call(refreshRoute, 'POST', '/v1/auth/refresh', { body: { refreshToken: 'ses_inconnue.secret' } });
    expect(res.status).toBe(401);
  });
});
