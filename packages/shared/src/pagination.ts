import { z } from 'zod';

/** Réponse paginée par curseur : `{ items, nextCursor }`. */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
};
