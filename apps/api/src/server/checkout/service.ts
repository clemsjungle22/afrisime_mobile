import {
  type Address,
  CheckoutRuleError,
  type DeliveryOptions,
  type Quote,
  type QuoteRequestInput,
  buildDeliveryOptions,
  buildQuote,
} from '@afrisime/shared';
import { eq } from 'drizzle-orm';
import { validate } from '../cart/service';
import { listAddresses } from '../customers/addresses';
import { storeCreditBalance as balanceOf } from '../customers/storeCredit';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { loadAgencies, loadRules, loadZone, slotOccupancy } from './rules';

type Customer = { id: string; segment: string };

/** Règle métier non respectée → erreur d'API au format commun (même code et message que le mode démo). */
export function asApiError(error: unknown): never {
  if (error instanceof CheckoutRuleError) {
    throw new ApiError(error.code as ApiError['code'], error.message, error.details, error.status);
  }
  throw error;
}

async function findAddress(db: Db, customerId: string, addressId: string | null): Promise<Address | null> {
  if (!addressId) return null;
  return (await listAddresses(db, customerId)).find((a) => a.id === addressId) ?? null;
}

export async function getDeliveryOptions(
  db: Db,
  customer: Customer,
  addressId: string | null,
  now = new Date(),
): Promise<DeliveryOptions> {
  const address = await findAddress(db, customer.id, addressId);
  if (addressId && !address) throw new ApiError('NOT_FOUND', 'Adresse introuvable.');
  const [rules, agencies, zone] = await Promise.all([loadRules(db), loadAgencies(db), loadZone(db, address?.zoneId ?? null)]);
  const isFull = await slotOccupancy(db, rules, now);
  return buildDeliveryOptions({ address, zone, agencies, rules, now, isFull });
}

/**
 * Devis : le panier est revalidé au prix du segment du client, puis les frais, le créneau et le moyen
 * de paiement sont contrôlés. Le devis est enregistré : seule une commande passée sur ce devis, avant
 * son expiration, sera acceptée.
 */
export async function createQuote(
  db: Db,
  customer: Customer,
  input: QuoteRequestInput,
  now = new Date(),
): Promise<Quote> {
  const request = { ...input, useStoreCredit: input.useStoreCredit ?? false };
  const [validated, rules, agencies, address] = await Promise.all([
    validate({ lines: request.lines }, customer.segment),
    loadRules(db),
    loadAgencies(db),
    findAddress(db, customer.id, request.addressId),
  ]);
  const [zone, isFull, storeCreditBalance] = await Promise.all([
    loadZone(db, address?.zoneId ?? null),
    slotOccupancy(db, rules, now),
    request.useStoreCredit ? balanceOf(db, customer.id) : Promise.resolve(0),
  ]);

  let quote: Quote;
  try {
    quote = buildQuote(request, {
      validated,
      address,
      zone,
      agency: agencies.find((a) => a.id === request.agencyId) ?? null,
      rules,
      now,
      quoteId: newId('qte'),
      isFull,
      storeCreditBalance,
    });
  } catch (error) {
    asApiError(error);
  }

  await db.insert(s.quotes).values({
    id: quote.quoteId,
    customerId: customer.id,
    payload: quote,
    total: quote.total,
    expiresAt: new Date(quote.expiresAt),
    createdAt: now,
  });
  return quote;
}

export async function getQuote(db: Db, quoteId: string) {
  const [row] = await db.select().from(s.quotes).where(eq(s.quotes.id, quoteId));
  return row ?? null;
}
