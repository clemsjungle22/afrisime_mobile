import { CreatePaymentBody, PaymentIntent } from '@afrisime/shared';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { idempotencyKey } from '@/server/idempotency';
import { createPayment } from '@/server/payments/service';

/** Paiement Mobile Money (Idempotency-Key obligatoire : jamais de double débit). */
export const POST = route(
  { auth: 'required', body: CreatePaymentBody, response: PaymentIntent, status: 201 },
  ({ auth, body, req }) => createPayment(getDb(), auth.customer.id, body, idempotencyKey(req)),
);
