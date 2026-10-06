import { z } from 'zod';

export const SuggestionType = z.enum(['query', 'product', 'category', 'brand']);
export type SuggestionType = z.infer<typeof SuggestionType>;

export const Suggestion = z.object({
  type: SuggestionType,
  label: z.string(),
  /** Slug du produit / rayon, ou texte de recherche pour type query / brand. */
  value: z.string(),
});
export type Suggestion = z.infer<typeof Suggestion>;

/** Réponse de GET /v1/search/suggest?q= */
export const SearchSuggestResponse = z.object({
  query: z.string(),
  /** Correction proposée (« Vouliez-vous dire… ? »), null si la saisie semble correcte. */
  correctedQuery: z.string().nullable(),
  suggestions: z.array(Suggestion).max(10),
});
export type SearchSuggestResponse = z.infer<typeof SearchSuggestResponse>;
