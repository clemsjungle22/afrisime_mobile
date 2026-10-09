import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DELETE as unregisterRoute, POST as registerRoute } from '@/app/v1/me/push-tokens/route';
import { createSession } from '@/server/auth/sessions';
import { setDb } from '@/server/db/client';
import * as s from '@/server/db/schema';
import { seedDatabase } from '@/server/db/seed';
import { resetEnvCache } from '@/server/env';
import { dispatchPush } from '@/server/notifications/push';
import { notify } from '@/server/notifications/service';
import { call } from './call';
import { createTestDb } from './pglite';

let t: Awaited<ReturnType<typeof createTestDb>>;
const realFetch = globalThis.fetch;
const sent: { token: string; title: string }[] = [];

beforeAll(async () => {
  t = await createTestDb();
  await seedDatabase(t.db);
  setDb(t.db);
  // Compte de service Firebase factice et serveurs Google simulés.
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const dir = mkdtempSync(join(tmpdir(), 'fcm-'));
  const file = join(dir, 'sa.json');
  writeFileSync(
    file,
    JSON.stringify({
      project_id: 'afrisime-test',
      client_email: 'push@afrisime-test.iam',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    }),
  );
  process.env.FCM_SERVICE_ACCOUNT_FILE = file;
  resetEnvCache();
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'jeton', expires_in: 3600 }), {
        status: 200,
      });
    }
    if (u === 'https://fcm.googleapis.com/v1/projects/afrisime-test/messages:send') {
      const body = JSON.parse(String(init?.body)) as {
        message: { token: string; notification: { title: string } };
      };
      if (body.message.token.startsWith('perime'))
        return new Response('{"error":{"status":"UNREGISTERED"}}', { status: 404 });
      sent.push({ token: body.message.token, title: body.message.notification.title });
      return new Response('{}', { status: 200 });
    }
    return realFetch(url, init);
  }) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  delete process.env.FCM_SERVICE_ACCOUNT_FILE;
  resetEnvCache();
  setDb(null);
  await t.close();
});

describe('notifications push', () => {
  it('téléphone inscrit : chaque notification part une seule fois ; jeton périmé retiré', async () => {
    await t.db.insert(s.customers).values({ id: 'usr_push', phone: '+22890000777' });
    const session = await createSession(t.db, 'usr_push', null);
    for (const token of ['telephone-afi-0001', 'perime-ancien-0001']) {
      const res = await call(registerRoute, 'POST', '/v1/me/push-tokens', {
        token: session.accessToken,
        body: { token, platform: 'android' },
      });
      expect(res.status).toBe(200);
    }

    await notify(t.db, 'usr_push', {
      kind: 'order',
      title: 'Commande prête',
      body: 'Votre commande vous attend.',
    });
    expect(await dispatchPush(t.db)).toBe(1);
    expect(sent).toEqual([{ token: 'telephone-afi-0001', title: 'Commande prête' }]);
    expect(await dispatchPush(t.db)).toBe(0);
    const tokens = await t.db
      .select()
      .from(s.pushTokens)
      .where(eq(s.pushTokens.customerId, 'usr_push'));
    expect(tokens.map((x) => x.token)).toEqual(['telephone-afi-0001']);

    // Déconnexion : plus de push sur ce téléphone.
    await call(unregisterRoute, 'DELETE', '/v1/me/push-tokens', {
      token: session.accessToken,
      body: { token: 'telephone-afi-0001', platform: 'android' },
    });
    await notify(t.db, 'usr_push', { kind: 'order', title: 'Livrée', body: '…' });
    expect(await dispatchPush(t.db)).toBe(0);
  });
});
