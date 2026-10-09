import type { AuthTokens, OtpVerifyResponse } from '@afrisime/shared';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { create } from 'zustand';
import { setAuthBridge } from '@/api/client';
import { isApiError } from '@/api/errors';
import { useCart } from '@/features/cart/store';
import { queryClient } from '@/lib/queryClient';
import { showSnackbar } from '@/stores/snackbar';
import { unregisterPush } from '@/features/notifications/push';
import { authApi } from './api';
import { storageKey } from '@/api/config';

/**
 * Session utilisateur.
 * - refresh token + identifiant dans expo-secure-store (chiffré), JAMAIS dans AsyncStorage ;
 * - jeton d'accès en mémoire uniquement ;
 * - un seul renouvellement en vol, partagé par toutes les requêtes.
 * Ne jamais journaliser de jeton ni de numéro complet.
 */

export type SessionStatus = 'loading' | 'guest' | 'authenticated';

type SessionState = {
  status: SessionStatus;
  userId: string | null;
  phone: string | null;
};

export const useSession = create<SessionState>()(() => ({ status: 'loading', userId: null, phone: null }));

const STORE_KEY = storageKey('afrisime.session');
const Stored = z.object({ refreshToken: z.string().min(1), userId: z.string(), phone: z.string() });
type Stored = z.infer<typeof Stored>;

/** Marge avant expiration : on renouvelle un peu avant pour éviter un 401 évitable. */
const EXPIRY_MARGIN_MS = 30_000;

let access: { token: string; expiresAt: number } | null = null;
let refreshInFlight: Promise<string | null> | null = null;

async function readStored(): Promise<Stored | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return null;
    const parsed = Stored.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeStored(value: Stored | null): Promise<void> {
  if (value) await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(value));
  else await SecureStore.deleteItemAsync(STORE_KEY);
}

function keepAccess(tokens: AuthTokens): void {
  access = { token: tokens.accessToken, expiresAt: Date.now() + tokens.expiresIn * 1000 };
}

/** Renouvellement unique partagé. null = session invalide ; lève une erreur si réseau indisponible. */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const stored = await readStored();
    if (!stored) return null;
    try {
      const tokens = await authApi.refresh(stored.refreshToken);
      // Rotation : le nouveau refresh token remplace l'ancien.
      await writeStored({ ...stored, refreshToken: tokens.refreshToken });
      keepAccess(tokens);
      return tokens.accessToken;
    } catch (error) {
      if (isApiError(error) && (error.status === 401 || error.status === 403)) return null;
      throw error;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function getAccessToken(): Promise<string | null> {
  if (useSession.getState().status !== 'authenticated') return null;
  if (access && access.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return access.token;
  try {
    const token = await refreshAccessToken();
    if (!token) expireSession();
    return token;
  } catch {
    // Hors ligne : on tente avec l'ancien jeton (la requête échouera proprement en NETWORK_ERROR).
    return access?.token ?? null;
  }
}

function clearLocalSession(): void {
  access = null;
  useSession.setState({ status: 'guest', userId: null, phone: null });
  queryClient.removeQueries({ queryKey: ['me'] });
}

/** La session ne peut plus être renouvelée : retour en visiteur (le panier local est conservé). */
export function expireSession(): void {
  if (useSession.getState().status !== 'authenticated') return;
  void writeStored(null).catch(() => undefined);
  clearLocalSession();
  showSnackbar({ message: 'Votre session a expiré. Reconnectez-vous pour continuer.' });
}

/** Au démarrage : restaure la session depuis le stockage chiffré (sans appel réseau bloquant). */
export async function bootstrapSession(): Promise<void> {
  setAuthBridge({ getAccessToken, refresh: refreshAccessToken, onSessionExpired: expireSession });
  const stored = await readStored();
  useSession.setState(
    stored
      ? { status: 'authenticated', userId: stored.userId, phone: stored.phone }
      : { status: 'guest', userId: null, phone: null },
  );
}

export async function signIn(result: OtpVerifyResponse): Promise<void> {
  await writeStored({ refreshToken: result.refreshToken, userId: result.user.id, phone: result.user.phone });
  keepAccess(result);
  queryClient.setQueryData(['me'], result.user);
  useSession.setState({ status: 'authenticated', userId: result.user.id, phone: result.user.phone });
}

/**
 * Déconnexion : révocation serveur au mieux (sans bloquer si hors ligne), puis effacement
 * des jetons, du panier local et des données personnelles en cache. Le catalogue reste en cache.
 */
export async function signOut(): Promise<void> {
  let guard: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      // Plus de push sur ce téléphone, puis révocation de la session.
      unregisterPush().then(() => authApi.logout()),
      new Promise((resolve) => {
        guard = setTimeout(resolve, 4000);
      }),
    ]);
  } catch {
    // Révocation impossible (hors ligne) : le jeton expirera côté serveur.
  } finally {
    clearTimeout(guard);
  }
  await writeStored(null).catch(() => undefined);
  useCart.getState().clear();
  queryClient.removeQueries({ queryKey: ['cart'] });
  clearLocalSession();
}
