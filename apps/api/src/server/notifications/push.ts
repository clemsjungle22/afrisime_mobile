import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { type Db, getDb } from '../db/client';
import * as s from '../db/schema';
import { env } from '../env';
import { log } from '../log';

/**
 * Notifications push Android, envoyées directement à Firebase Cloud Messaging (API HTTP v1, gratuite).
 * Sans compte de service Firebase configuré (FCM_SERVICE_ACCOUNT_FILE), rien n'est envoyé : le centre
 * de notifications de l'app fonctionne quand même.
 */

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

/** Une notification plus ancienne n'est plus envoyée en push (serveur arrêté entre-temps…). */
const MAX_AGE_MS = 60 * 60_000;

let account: ServiceAccount | null | undefined;
function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const file = env().FCM_SERVICE_ACCOUNT_FILE;
  try {
    account = file ? (JSON.parse(readFileSync(file, 'utf8')) as ServiceAccount) : null;
  } catch (error) {
    log.error('compte de service Firebase illisible : push désactivé', { file, error });
    account = null;
  }
  return account;
}

export const pushEnabled = () => serviceAccount() !== null;

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

let token: { value: string; expiresAt: number } | null = null;
/** Jeton d'accès OAuth 2 du compte de service (valable 1 h, gardé en mémoire). */
async function accessToken(sa: ServiceAccount): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
  });
  if (!res.ok) throw new Error(`jeton Firebase refusé : ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

/** Envoie un message à un téléphone ; false si le jeton n'est plus valable (app désinstallée…). */
async function send(
  sa: ServiceAccount,
  to: string,
  n: { id: string; title: string; body: string; link: unknown },
) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await accessToken(sa)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: to,
        notification: { title: n.title, body: n.body },
        data: { notificationId: n.id, link: n.link ? JSON.stringify(n.link) : '' },
        android: { priority: 'high', notification: { channel_id: 'default' } },
      },
    }),
  });
  if (res.ok) return true;
  const text = await res.text();
  if (res.status === 404 || text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT'))
    return false;
  throw new Error(`envoi push refusé : ${res.status} ${text}`);
}

/**
 * Envoie en push les notifications pas encore envoyées. Chacune n'est prise qu'une fois (pushedAt posé
 * avant l'envoi) : deux envois simultanés ne la doublent jamais.
 */
export async function dispatchPush(db: Db, now = new Date()): Promise<number> {
  const sa = serviceAccount();
  if (!sa) return 0;
  const taken = await db
    .update(s.notifications)
    .set({ pushedAt: now })
    .where(
      and(
        isNull(s.notifications.pushedAt),
        gt(s.notifications.createdAt, new Date(now.getTime() - MAX_AGE_MS)),
      ),
    )
    .returning();
  if (taken.length === 0) return 0;
  const tokens = await db
    .select()
    .from(s.pushTokens)
    .where(inArray(s.pushTokens.customerId, [...new Set(taken.map((n) => n.customerId))]));
  let sent = 0;
  for (const n of taken) {
    for (const t of tokens.filter((x) => x.customerId === n.customerId)) {
      try {
        if (await send(sa, t.token, n)) sent++;
        else await db.delete(s.pushTokens).where(eq(s.pushTokens.token, t.token));
      } catch (error) {
        log.error('notification push non envoyée', { notificationId: n.id, error });
      }
    }
  }
  return sent;
}

let scheduled = false;
/** Envoi juste après l'enregistrement (la transaction de l'événement est alors terminée). */
export function schedulePush() {
  if (scheduled || !pushEnabled()) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    dispatchPush(getDb()).catch((error: unknown) =>
      log.error('envoi des notifications push en échec', { error }),
    );
  }, 1_000);
}

/** Inscrit le téléphone (un jeton appartient au dernier client connecté sur ce téléphone). */
export async function registerPushToken(
  db: Db,
  customerId: string,
  value: string,
  platform: string,
  now = new Date(),
) {
  await db
    .insert(s.pushTokens)
    .values({ token: value, customerId, platform, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: s.pushTokens.token,
      set: { customerId, platform, updatedAt: now },
    });
}

export async function unregisterPushToken(db: Db, customerId: string, value: string) {
  await db
    .delete(s.pushTokens)
    .where(and(eq(s.pushTokens.token, value), eq(s.pushTokens.customerId, customerId)));
}
