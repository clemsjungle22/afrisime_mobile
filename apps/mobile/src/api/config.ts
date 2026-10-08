import Constants from 'expo-constants';

/**
 * Configuration de l'API. Les EXPO_PUBLIC_* sont embarquées dans le bundle : publiques, aucun secret.
 * Accès direct à process.env.EXPO_PUBLIC_X obligatoire (Expo les remplace au build).
 */

const mock = process.env.EXPO_PUBLIC_API_MOCK === 'true';

/** Port du serveur de développement (apps/api : npm run api). */
const DEV_API_PORT = 4000;

/**
 * En développement, le serveur tourne sur le même PC que Metro : on reprend l'adresse par laquelle
 * le téléphone a chargé l'app (ex. 10.119.16.206:8081) avec le port de l'API.
 * Rien à changer quand le PC change de réseau Wi-Fi.
 */
function devServerUrl(): string | null {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  // Mode tunnel (`expo start --tunnel`) : l'adresse est celle du tunnel d'Expo (…exp.direct),
  // pas celle du PC. Le serveur n'y est pas joignable : on n'invente pas d'adresse.
  if (!host || !isLocalHost(host)) return null;
  return `http://${host}:${DEV_API_PORT}`;
}

/** Adresse IPv4 ou nom local (localhost) : joignable directement sur le réseau Wi-Fi. */
function isLocalHost(host: string): boolean {
  return host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

/** Pourquoi aucune adresse de serveur n'est disponible (affiché tel quel dans l'app), sinon null. */
function serverIssue(): string | null {
  if (mock || resolveBaseUrl()) return null;
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? '';
  return host && !isLocalHost(host)
    ? 'Expo est lancé en mode tunnel : le téléphone ne peut pas joindre le serveur du PC. Relancez avec « npm run start:clear » (même Wi-Fi) ou définissez EXPO_PUBLIC_API_URL.'
    : 'Adresse du serveur inconnue : définissez EXPO_PUBLIC_API_URL dans apps/mobile/.env.';
}

/** Adresse explicite (EXPO_PUBLIC_API_URL) en priorité, sinon déduite en développement. */
function resolveBaseUrl(): string {
  const explicit = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return (__DEV__ ? devServerUrl() : null) ?? '';
}

const issue = serverIssue();

/** Pourquoi le serveur ne peut pas être joint (configuration), sinon null. */
export function missingServerReason(): string | null {
  return issue;
}

export const apiConfig = {
  baseUrl: resolveBaseUrl(),
  mock,
  timeoutMs: 15_000,
  maxRetries: 2,
} as const;

/**
 * Nom d'enregistrement sur le téléphone, propre au mode (démo ou serveur) : session, cache et panier
 * d'un mode ne se mélangent jamais avec ceux de l'autre quand on bascule.
 * Le mode démo garde les noms historiques (aucune donnée perdue).
 */
export function storageKey(base: string): string {
  return mock ? base : `${base}.api`;
}
