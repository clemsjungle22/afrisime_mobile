import { Quote, QuoteRequest } from '@afrisime/shared';
import { createQuote } from '@/server/checkout/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Devis final : total garanti pendant sa durée de validité, ou CART_CHANGED avec le détail des écarts. */
export const POST = route(
  { auth: 'required', body: QuoteRequest, response: Quote },
  ({ auth, body }) => createQuote(getDb(), auth.customer, body),
);
