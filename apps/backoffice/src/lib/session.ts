import 'server-only';
import { cookies } from 'next/headers';

/** Jeton de session de l'équipe : cookie httpOnly, jamais lisible par le JavaScript de la page. */
export const TOKEN_COOKIE = 'afs_admin';
/** Étape de connexion en cours (code 2FA ou activation), 5 minutes. */
const CHALLENGE_COOKIE = 'afs_challenge';

const base = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function getToken(): Promise<string | null> {
  return (await cookies()).get(TOKEN_COOKIE)?.value ?? null;
}

export async function setSession(token: string, expiresAt: string) {
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, { ...base, expires: new Date(expiresAt) });
  store.delete(CHALLENGE_COOKIE);
}

export async function clearSession() {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  store.delete(CHALLENGE_COOKIE);
}

export type Challenge = { id: string; kind: 'totp' | 'totp_setup' };

export async function setChallenge(challenge: Challenge) {
  (await cookies()).set(CHALLENGE_COOKIE, `${challenge.kind}:${challenge.id}`, {
    ...base,
    maxAge: 5 * 60,
  });
}

export async function getChallenge(): Promise<Challenge | null> {
  const raw = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  const [kind, id] = raw?.split(':') ?? [];
  return id && (kind === 'totp' || kind === 'totp_setup') ? { id, kind } : null;
}
