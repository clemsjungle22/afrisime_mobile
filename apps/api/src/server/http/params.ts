import { Money, ProductListQuery } from '@afrisime/shared';
import { z } from 'zod';

/** Les paramètres d'URL arrivent en texte : les nombres sont convertis avant validation. */
const fromText = <T extends z.ZodType<number, number>>(schema: T) => z.coerce.number().pipe(schema);

export const ProductListParams = ProductListQuery.extend({
  minPrice: fromText(Money).optional(),
  maxPrice: fromText(Money).optional(),
  limit: fromText(z.number().int().min(1).max(50)).optional(),
});

/** Réponses publiques du catalogue : réutilisables 60 s par le téléphone ou un CDN. */
export const PUBLIC_CACHE = { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' };
