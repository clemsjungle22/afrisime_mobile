import { Address, AddressInput, AddressList } from '@afrisime/shared';
import { createAddress, listAddresses } from '@/server/customers/addresses';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

export const GET = route({ auth: 'required', response: AddressList }, ({ auth }) =>
  listAddresses(getDb(), auth.customer.id),
);

/** Nouvelle adresse : la zone de livraison est attribuée par le serveur. */
export const POST = route(
  { auth: 'required', body: AddressInput, response: Address, status: 201 },
  ({ auth, body }) => createAddress(getDb(), auth.customer.id, body),
);
