import type { ProductBadge } from '@afrisime/shared';
import type { BadgeTone } from '@/components/ui';

/** Libellés et tons des badges produit. Rupture / sur commande sont portés par la disponibilité. */
export const productBadges: Record<ProductBadge, { label: string; tone: BadgeTone } | null> = {
  popular: { label: 'Populaire', tone: 'brand' },
  promotion: { label: 'Promo', tone: 'accent' },
  new: { label: 'Nouveau', tone: 'info' },
  b2b: { label: 'Format pro', tone: 'neutral' },
  out_of_stock: null,
  on_order: null,
};
