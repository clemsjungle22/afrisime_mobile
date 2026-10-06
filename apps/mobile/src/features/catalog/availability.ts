import type { Availability, Variant } from '@afrisime/shared';
import type { BadgeTone } from '@/components/ui';

export type AvailabilityAction = 'add_to_cart' | 'order' | 'notify_me' | 'request_quote';

export type AvailabilityPresentation = {
  label: string;
  tone: BadgeTone;
  action: AvailabilityAction;
  ctaLabel: string;
  /** Le produit peut entrer dans le panier (disponible ou sur commande). */
  purchasable: boolean;
  /** Mention complémentaire sous le prix (délai…). */
  hint: string | null;
};

function leadTimeText(days: number | null): string | null {
  if (days === null || days <= 0) return null;
  return days === 1 ? 'Délai : 1 jour' : `Délai : ${days} jours`;
}

/**
 * Rendu et action de chacun des 4 états de disponibilité (domaine §3).
 * available → ajouter ; on_order → commander avec délai ;
 * unavailable → m'alerter (pas d'ajout) ; quote_only → demander un devis.
 */
export function presentAvailability(
  availability: Availability,
  leadTimeDays: Variant['leadTimeDays'] = null,
): AvailabilityPresentation {
  switch (availability) {
    case 'available':
      return {
        label: 'Disponible',
        tone: 'success',
        action: 'add_to_cart',
        ctaLabel: 'Ajouter au panier',
        purchasable: true,
        hint: null,
      };
    case 'on_order': {
      const hint = leadTimeText(leadTimeDays);
      return {
        label: 'Sur commande',
        tone: 'info',
        action: 'order',
        ctaLabel: 'Commander',
        purchasable: true,
        hint: hint ?? 'Délai communiqué à la commande',
      };
    }
    case 'unavailable':
      return {
        label: 'Temporairement indisponible',
        tone: 'error',
        action: 'notify_me',
        ctaLabel: "M'alerter du retour",
        purchasable: false,
        hint: null,
      };
    case 'quote_only':
      return {
        label: 'Prix sur devis',
        tone: 'warning',
        action: 'request_quote',
        ctaLabel: 'Demander un devis',
        purchasable: false,
        hint: null,
      };
  }
}
