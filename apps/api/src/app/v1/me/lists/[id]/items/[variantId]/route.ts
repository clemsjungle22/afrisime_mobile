import { SetListItemBody, ShoppingList } from '@afrisime/shared';
import { removeListItem, setListItem } from '@/server/customers/lists';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

export const PATCH = route(
  { auth: 'required', body: SetListItemBody, response: ShoppingList },
  ({ auth, body, params }) =>
    setListItem(getDb(), auth.customer, params.id ?? '', params.variantId ?? '', body.quantity),
);

export const DELETE = route({ auth: 'required', response: ShoppingList }, ({ auth, params }) =>
  removeListItem(getDb(), auth.customer, params.id ?? '', params.variantId ?? ''),
);
