import { RenameListBody, ShoppingList, ShoppingListIndex } from '@afrisime/shared';
import { deleteList, getList, renameList } from '@/server/customers/lists';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Liste revalidée au prix et au stock du moment. */
export const GET = route({ auth: 'required', response: ShoppingList }, ({ auth, params }) =>
  getList(getDb(), auth.customer, params.id ?? ''),
);

export const PATCH = route(
  { auth: 'required', body: RenameListBody, response: ShoppingList },
  ({ auth, body, params }) => renameList(getDb(), auth.customer, params.id ?? '', body.name),
);

export const DELETE = route({ auth: 'required', response: ShoppingListIndex }, ({ auth, params }) =>
  deleteList(getDb(), auth.customer, params.id ?? ''),
);
