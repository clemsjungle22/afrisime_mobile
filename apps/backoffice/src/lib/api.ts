import 'server-only';
import { ApiErrorBody } from '@afrisime/shared';
import { headers } from 'next/headers';
import type { z } from 'zod';
import { getToken } from './session';

/**
 * Appels au serveur AfriSime, depuis le serveur du back-office uniquement :
 * le navigateur ne voit jamais le jeton de l'équipe (cookie httpOnly relu ici).
 */
const API_URL = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Session absente, expirée ou révoquée. */
  get isUnauthenticated() {
    return this.status === 401;
  }

  get reason(): string | undefined {
    return (this.details as { reason?: string } | undefined)?.reason;
  }
}

type Options<S extends z.ZodType> = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  schema: S;
  /** false : appel sans jeton (connexion). */
  auth?: boolean;
};

export async function api<S extends z.ZodType>(path: string, options: Options<S>): Promise<z.infer<S>> {
  const incoming = await headers();
  const h: Record<string, string> = { accept: 'application/json' };
  // L'adresse IP et l'appareil de la personne servent aux limites anti-abus et au journal d'audit.
  const ip = incoming.get('x-forwarded-for')?.split(',')[0]?.trim() || incoming.get('x-real-ip');
  if (ip) h['x-forwarded-for'] = ip;
  const ua = incoming.get('user-agent');
  if (ua) h['user-agent'] = ua;
  if (options.body !== undefined) h['content-type'] = 'application/json';
  if (options.auth !== false) {
    const token = await getToken();
    if (!token) throw new ApiError('UNAUTHENTICATED', 'Session expirée. Reconnectez-vous.', 401);
    h.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: h,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Le serveur AfriSime ne répond pas. Vérifiez qu’il est lancé (npm run api).', 0);
  }

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = ApiErrorBody.safeParse(json);
    if (err.success) throw new ApiError(err.data.error.code, err.data.error.message, res.status, err.data.error.details);
    throw new ApiError('INTERNAL_ERROR', 'Une erreur est survenue. Réessayez.', res.status);
  }
  const parsed = options.schema.safeParse(json);
  if (!parsed.success) throw new ApiError('INVALID_RESPONSE', 'Réponse inattendue du serveur.', res.status);
  return parsed.data;
}
