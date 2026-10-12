import {
  Address,
  AddressInput,
  AddressList,
  DeliveryOptions,
  Quote,
  QuoteRequest,
} from '@afrisime/shared';
import { z } from 'zod';
import type { CheckoutApi } from '@/features/checkout/api';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { buildQuote, deliveryOptions, withZone } from './checkoutEngine';
import { mockCheckoutCredit } from './credit';
import { assertMockKycAllows } from './kyc';
import { mockProducts, mockStock } from '@afrisime/fixtures';
import { loadDb, saveDb } from './db';
import { registerQuote } from './orderServer';
import { creditBalance } from './storeCredit';
import { useMockScenarios } from './scenarios';
import { mockError, simulate } from './simulate';

const read = <T>(run: () => Promise<T>, signal?: AbortSignal) => withRetry(run, { canRetry: true, signal });
const once = <T>(run: () => Promise<T>) => withRetry(run, { canRetry: false });
let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function userAddresses(userId: string): Promise<Address[]> {
  return (await loadDb()).addresses[userId] ?? [];
}

async function saveAddresses(userId: string, list: Address[]): Promise<void> {
  const db = await loadDb();
  await saveDb({ ...db, addresses: { ...db.addresses, [userId]: list } });
}

/** Une seule adresse par défaut ; la première créée le devient. */
function normalizeDefault(list: Address[], preferredId: string | null): Address[] {
  const defaultId = preferredId ?? list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null;
  return list.map((a) => ({ ...a, isDefault: a.id === defaultId }));
}

export const mockCheckoutApi: CheckoutApi = {
  listAddresses(signal) {
    return read(
      () => withAuth((token) => simulate(AddressList, async () => userAddresses((await requireUser(token)).id))),
      signal,
    );
  },

  createAddress(input) {
    return once(() =>
      withAuth((token) =>
        simulate(Address, async () => {
          const user = await requireUser(token);
          const list = await userAddresses(user.id);
          const created: Address = withZone({ ...AddressInput.parse(input), id: newId('adr') });
          const next = normalizeDefault([...list, created], created.isDefault || list.length === 0 ? created.id : null);
          await saveAddresses(user.id, next);
          return next.find((a) => a.id === created.id);
        }),
      ),
    );
  },

  updateAddress(id, input) {
    return read(() =>
      withAuth((token) =>
        simulate(Address, async () => {
          const user = await requireUser(token);
          const list = await userAddresses(user.id);
          if (!list.some((a) => a.id === id)) throw mockError('NOT_FOUND', 'Adresse introuvable.', 404);
          const parsed = AddressInput.parse(input);
          const next = normalizeDefault(
            list.map((a) => (a.id === id ? withZone({ ...parsed, id }) : a)),
            parsed.isDefault ? id : null,
          );
          await saveAddresses(user.id, next);
          return next.find((a) => a.id === id);
        }),
      ),
    );
  },

  async deleteAddress(id) {
    await read(() =>
      withAuth((token) =>
        simulate(z.unknown(), async () => {
          const user = await requireUser(token);
          const list = await userAddresses(user.id);
          await saveAddresses(user.id, normalizeDefault(list.filter((a) => a.id !== id), null));
          return null;
        }),
      ),
    );
  },

  getDeliveryOptions(addressId, signal) {
    return read(
      () =>
        withAuth((token) =>
          simulate(DeliveryOptions, async () => {
            const user = await requireUser(token);
            const address = addressId ? ((await userAddresses(user.id)).find((a) => a.id === addressId) ?? null) : null;
            return deliveryOptions(address, new Date(), mockCheckoutCredit(await loadDb(), user.id));
          }),
        ),
      signal,
    );
  },

  quote(body, signal) {
    return read(
      () =>
        withAuth((token) =>
          simulate(Quote, async () => {
            const user = await requireUser(token);
            const quote = buildQuote(QuoteRequest.parse(body), {
              products: mockProducts,
              stock: mockStock,
              overrides: useMockScenarios.getState().overrides,
              addresses: await userAddresses(user.id),
              now: new Date(),
              newId: () => newId('qte'),
              storeCreditBalance: creditBalance(await loadDb(), user.id),
              credit: mockCheckoutCredit(await loadDb(), user.id),
            });
            // Identité : prévenu dès le devis si la commande ferait dépasser le seuil sans vérification.
            assertMockKycAllows(await loadDb(), user.id, quote.total);
            // Le serveur garde le devis signé : seule une commande sur ce devis sera acceptée.
            registerQuote(user.id, quote);
            return quote;
          }),
        ),
      signal,
    );
  },
};
