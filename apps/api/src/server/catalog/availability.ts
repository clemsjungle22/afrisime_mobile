import type { Availability } from '@afrisime/shared';

export type SaleMode = 'standard' | 'on_order' | 'quote_only';

/**
 * Disponibilité affichée d'un format, calculée par le serveur (jamais la quantité exacte) :
 * le mode de vente prime, sinon c'est le stock vendable (en main − réservé) qui décide.
 */
export function computeAvailability(saleMode: SaleMode, onHand: number, reserved: number): Availability {
  if (saleMode === 'quote_only') return 'quote_only';
  if (saleMode === 'on_order') return 'on_order';
  return onHand - reserved > 0 ? 'available' : 'unavailable';
}
