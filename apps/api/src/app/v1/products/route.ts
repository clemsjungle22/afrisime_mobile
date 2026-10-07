import { ProductListResponse } from '@afrisime/shared';
import { listProducts } from '@/server/catalog/service';
import { PUBLIC_CACHE, ProductListParams } from '@/server/http/params';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** Recherche, filtres, tris, facettes et pagination du catalogue. */
export const GET = route({ query: ProductListParams, response: ProductListResponse, headers: PUBLIC_CACHE }, ({ query }) =>
  listProducts(query),
);
