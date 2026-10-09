import { CreateListBody, ShoppingList, ShoppingListIndex } from '@afrisime/shared';
import { createList, listLists } from '@/server/customers/lists';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Listes d'achats du client, la plus récemment modifiée d'abord. */
export const GET = route({ auth: 'required', response: ShoppingListIndex }, ({ auth }) =>
  listLists(getDb(), auth.customer.id),
);

/** Nouvelle liste : vide, avec des produits, ou copie d'une commande passée. */
export const POST = route(
  { auth: 'required', body: CreateListBody, response: ShoppingList, status: 201 },
  ({ auth, body }) => createList(getDb(), auth.customer, body),
);
