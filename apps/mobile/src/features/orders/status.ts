import type { OrderStatus, PaymentIntent, PaymentMethodId } from '@afrisime/shared';
import type { BadgeTone } from '@/components/ui';

export const orderStatusInfo: Record<OrderStatus, { label: string; tone: BadgeTone }> = {
  pending_payment: { label: 'En attente de paiement', tone: 'warning' },
  payment_failed: { label: 'Paiement non abouti', tone: 'error' },
  confirmed: { label: 'Confirmée', tone: 'info' },
  preparing: { label: 'En préparation', tone: 'info' },
  ready_for_pickup: { label: 'Prête au retrait', tone: 'success' },
  out_for_delivery: { label: 'En livraison', tone: 'info' },
  delivered: { label: 'Livrée', tone: 'success' },
  completed: { label: 'Terminée', tone: 'success' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  refunded: { label: 'Remboursée', tone: 'neutral' },
};

export const paymentMethodLabels: Record<PaymentMethodId, string> = {
  mixx: 'Mixx by Yas',
  flooz: 'Moov Money (Flooz)',
  card: 'Carte bancaire',
  cash_on_delivery: 'Paiement à la livraison',
  pay_at_agency: 'Paiement en agence',
};

export const isMobileMoney = (m: PaymentMethodId): m is 'mixx' | 'flooz' => m === 'mixx' || m === 'flooz';

/** Vérification serrée au début (le client valide en général en moins d'une minute). */
export const FAST_POLL_MS = 3_000;
export const FAST_PHASE_MS = 60_000;
export const SLOW_POLL_MS = 10_000;
/** Marge après l'expiration annoncée avant d'abandonner le suivi automatique. */
export const EXPIRY_GRACE_MS = 15_000;

/**
 * Délai avant la prochaine vérification du statut de paiement, ou false pour arrêter :
 * 3 s pendant 1 min, puis 10 s jusqu'à expiration (+15 s), puis arrêt → « paiement en attente ».
 */
export function nextPollDelay(
  intent: Pick<PaymentIntent, 'status' | 'expiresAt'> | undefined,
  startedAt: number,
  now: number,
): number | false {
  if (!intent) return FAST_POLL_MS;
  if (intent.status !== 'pending' && intent.status !== 'initiated') return false;
  if (now - startedAt < FAST_PHASE_MS) return FAST_POLL_MS;
  if (now < Date.parse(intent.expiresAt) + EXPIRY_GRACE_MS) return SLOW_POLL_MS;
  return false;
}
