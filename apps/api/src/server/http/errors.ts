import type { ApiErrorBody, ApiErrorCode } from '@afrisime/shared';

const STATUS: Partial<Record<ApiErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  OTP_TOO_MANY_ATTEMPTS: 429,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  IDEMPOTENCY_CONFLICT: 409,
  CART_CHANGED: 409,
  QUOTE_EXPIRED: 409,
  ORDER_NOT_CANCELLABLE: 409,
  ORDER_NOT_PAYABLE: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Erreur métier attendue : traduite telle quelle dans le corps d'erreur unique de l'API.
 * Toute autre exception devient un INTERNAL_ERROR sans détail technique côté client.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
    status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? STATUS[code] ?? 422;
  }
}

export function errorBody(code: string, message: string, requestId: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}
