import { Address, AddressInput } from '@afrisime/shared';
import { z } from 'zod';
import { deleteAddress, updateAddress } from '@/server/customers/addresses';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

export const PATCH = route({ auth: 'required', body: AddressInput, response: Address }, ({ auth, body, params }) =>
  updateAddress(getDb(), auth.customer.id, params.id ?? '', body),
);

export const DELETE = route({ auth: 'required', response: z.null(), status: 204 }, async ({ auth, params }) => {
  await deleteAddress(getDb(), auth.customer.id, params.id ?? '');
  return null;
});
