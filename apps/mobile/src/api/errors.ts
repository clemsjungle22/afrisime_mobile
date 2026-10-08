import type { ApiErrorCode } from '@afrisime/shared';

/** Codes produits côté client (jamais renvoyés par le serveur). */
export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'CONFIG_ERROR' | 'UNKNOWN';

export type ErrorCode = ApiErrorCode | ClientErrorCode | (string & {});

/** Erreur normalisée : toute erreur d'appel API devient une ApiError. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number | null;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(params: {
    code: ErrorCode;
    message: string;
    status?: number | null;
    details?: unknown;
    requestId?: string | null;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code;
    this.status = params.status ?? null;
    this.details = params.details;
    this.requestId = params.requestId ?? null;
  }

  /** Erreur de connectivité : à afficher comme « hors ligne », données en cache si disponibles. */
  get isNetwork(): boolean {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }

  /** Erreur transitoire qu'on peut réessayer (si la requête est idempotente). */
  get isRetryable(): boolean {
    return this.isNetwork || this.code === 'RATE_LIMITED' || (this.status !== null && this.status >= 500);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export const networkErrorMessage = 'Connexion instable, nous réessayons…';
