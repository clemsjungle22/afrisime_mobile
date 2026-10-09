import { FavoriteList } from '@afrisime/shared';
import { listFavorites } from '@/server/customers/lists';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Produits favoris, au prix du moment. */
export const GET = route({ auth: 'required', response: FavoriteList }, ({ auth }) =>
  listFavorites(getDb(), auth.customer),
);
