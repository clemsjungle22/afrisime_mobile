import { ApiErrorBody } from '@afrisime/shared';
import { randomUUID } from 'expo-crypto';
import type { z } from 'zod';
import { apiConfig } from './config';
import { ApiError, networkErrorMessage } from './errors';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions<S extends z.ZodType> = {
  method?: Method;
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Schéma zod de la réponse : la réponse est toujours parsée (`unknown` → type sûr). */
  schema: S;
  /**
   * Clé d'idempotence, générée UNE fois par intention (newIdempotencyKey) et réutilisée telle quelle
   * à chaque retry. Obligatoire sur POST /orders, /payments, /credit/repayments, etc.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
};

/** Fournit le jeton d'accès courant (branché par la feature auth ; refresh à venir). */
type TokenGetter = () => Promise<string | null> | string | null;
let getAccessToken: TokenGetter = () => null;

export function setAccessTokenGetter(getter: TokenGetter): void {
  getAccessToken = getter;
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${apiConfig.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] != null && entry[1] !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return params.length > 0 ? `${url}?${params.join('&')}` : url;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ApiError({ code: 'UNKNOWN', message: 'Requête annulée.' }));
    });
  });
}

/** Backoff exponentiel avec jitter : ~500 ms, ~1 s, ~2 s… */
function backoffDelay(attempt: number): number {
  return 500 * 2 ** attempt + Math.floor(Math.random() * 250);
}

async function toApiError(response: Response): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // corps absent ou non JSON
  }
  const parsed = ApiErrorBody.safeParse(payload);
  if (parsed.success) {
    const { code, message, details, requestId } = parsed.data.error;
    return new ApiError({ code, message, details, requestId, status: response.status });
  }
  return new ApiError({
    code: response.status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN',
    message: 'Une erreur est survenue. Veuillez réessayer.',
    status: response.status,
  });
}

async function attempt<S extends z.ZodType>(
  method: Method,
  url: string,
  options: RequestOptions<S>,
): Promise<z.infer<S>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? apiConfig.timeoutMs);
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    if (options.signal?.aborted) {
      throw new ApiError({ code: 'UNKNOWN', message: 'Requête annulée.' });
    }
    const timedOut = controller.signal.aborted;
    throw new ApiError({ code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', message: networkErrorMessage });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  if (!response.ok) throw await toApiError(response);

  const data: unknown = response.status === 204 ? null : await response.json().catch(() => undefined);
  const result = options.schema.safeParse(data);
  if (!result.success) {
    // Ne jamais loguer le corps : il peut contenir des données personnelles.
    throw new ApiError({
      code: 'INVALID_RESPONSE',
      message: 'Réponse inattendue du serveur.',
      status: response.status,
      requestId: response.headers.get('x-request-id'),
    });
  }
  return result.data;
}

/**
 * Exécute `run` avec retries (backoff) sur les erreurs transitoires.
 * Partagé par le client HTTP et les mocks pour un comportement identique.
 * `canRetry` doit être faux pour toute écriture sans Idempotency-Key.
 */
export async function withRetry<T>(
  run: () => Promise<T>,
  { canRetry, signal }: { canRetry: boolean; signal?: AbortSignal },
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await run();
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError({ code: 'UNKNOWN', message: 'Une erreur est survenue.' });
      if (!canRetry || !apiError.isRetryable || i >= apiConfig.maxRetries || signal?.aborted) {
        throw apiError;
      }
      await wait(backoffDelay(i), signal);
    }
  }
}

/**
 * Appel HTTP vers le backend AfriSime.
 * Retry automatique uniquement pour les GET et les requêtes portant une Idempotency-Key,
 * jamais pour un POST sans clé.
 */
export function request<S extends z.ZodType>(
  path: string,
  options: RequestOptions<S>,
): Promise<z.infer<S>> {
  const method = options.method ?? 'GET';
  const url = buildUrl(path, options.query);
  const canRetry = method === 'GET' || options.idempotencyKey !== undefined;
  return withRetry(() => attempt(method, url, options), { canRetry, signal: options.signal });
}
