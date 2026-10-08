import { z } from 'zod';

/** Codes métier renvoyés par l'API (contrat v1). */
export const ApiErrorCode = z.enum([
  'OTP_INVALID',
  'OTP_TOO_MANY_ATTEMPTS',
  'OTP_EXPIRED',
  'CART_CHANGED',
  'OUT_OF_STOCK',
  'MIN_ORDER_NOT_MET',
  'ZONE_NOT_SERVED',
  'SLOT_UNAVAILABLE',
  'COUPON_INVALID',
  'COUPON_NOT_CUMULABLE',
  'CREDIT_NOT_ELIGIBLE',
  'CREDIT_INSUFFICIENT',
  'CREDIT_SUSPENDED',
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
  'PAYMENT_METHOD_UNAVAILABLE',
  'ORDER_NOT_CANCELLABLE',
  'ORDER_NOT_PAYABLE',
  'QUOTE_EXPIRED',
  'IDEMPOTENCY_CONFLICT',
  // Le back-office : la commande a été modifiée entre-temps par quelqu'un d'autre.
  'ORDER_CHANGED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'INTERNAL_ERROR',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

/** Corps d'erreur unique de l'API. `code` reste une chaîne libre pour tolérer un code inconnu. */
export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
