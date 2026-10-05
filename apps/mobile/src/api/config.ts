/**
 * Configuration de l'API. Les EXPO_PUBLIC_* sont embarquées dans le bundle : publiques, aucun secret.
 * Accès direct à process.env.EXPO_PUBLIC_X obligatoire (Expo les remplace au build).
 */
export const apiConfig = {
  baseUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
  mock: process.env.EXPO_PUBLIC_API_MOCK === 'true',
  timeoutMs: 15_000,
  maxRetries: 2,
} as const;
