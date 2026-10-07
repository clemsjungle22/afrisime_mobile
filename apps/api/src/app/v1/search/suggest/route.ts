import { SearchSuggestResponse } from '@afrisime/shared';
import { z } from 'zod';
import { suggestProducts } from '@/server/catalog/service';
import { PUBLIC_CACHE } from '@/server/http/params';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

const Params = z.object({ q: z.string().max(100).default('') });

/** Suggestions pendant la saisie (rayons, marques, produits) et correction des fautes de frappe. */
export const GET = route({ query: Params, response: SearchSuggestResponse, headers: PUBLIC_CACHE }, ({ query }) =>
  suggestProducts(query.q),
);
