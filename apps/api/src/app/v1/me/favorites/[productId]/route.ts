import { FavoriteList } from '@afrisime/shared';
import { addFavorite, removeFavorite } from '@/server/customers/lists';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Ajouter aux favoris (rejouable sans effet). */
export const PUT = route({ auth: 'required', response: FavoriteList }, ({ auth, params }) =>
  addFavorite(getDb(), auth.customer, params.productId ?? ''),
);

export const DELETE = route({ auth: 'required', response: FavoriteList }, ({ auth, params }) =>
  removeFavorite(getDb(), auth.customer, params.productId ?? ''),
);
