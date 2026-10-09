import { AddListItemBody, ShoppingList } from '@afrisime/shared';
import { addListItem } from '@/server/customers/lists';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Ajouter un format à la liste (quantité cumulée s'il y est déjà). */
export const POST = route(
  { auth: 'required', body: AddListItemBody, response: ShoppingList },
  ({ auth, body, params }) => addListItem(getDb(), auth.customer, params.id ?? '', body),
);
