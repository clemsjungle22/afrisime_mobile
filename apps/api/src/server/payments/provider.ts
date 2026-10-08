import { createHmac } from 'node:crypto';
import type { PaymentAction } from '@afrisime/shared';
import { safeEqual } from '../auth/tokens';
import { env } from '../env';

/**
 * Interface commune des prestataires de paiement (Mixx by Yas, Moov Money, agrégateur…).
 * Brancher un vrai prestataire = écrire une implémentation de plus, sans toucher aux commandes.
 */
export type ProviderStatus = 'pending' | 'succeeded' | 'failed' | 'expired';

export type ProviderPayment = {
  id: string;
  method: 'mixx' | 'flooz';
  amount: number;
  phone: string;
  createdAt: Date;
  expiresAt: Date;
  providerReference: string | null;
  providerData: unknown;
};

export type WebhookEvent = { eventId: string; reference: string; status: ProviderStatus; failureReason: string | null };

export interface PaymentProvider {
  readonly name: string;
  /** Demande le débit : le client confirme ensuite sur son téléphone. */
  initiate(payment: ProviderPayment): Promise<{ reference: string; data: unknown; action: PaymentAction }>;
  /** État chez le prestataire (rattrapage si le webhook n'arrive pas). */
  fetchStatus(payment: ProviderPayment, now: Date): Promise<{ status: ProviderStatus; failureReason: string | null }>;
  /** Vérifie la signature d'un webhook et en extrait l'événement ; null si la signature est invalide. */
  parseWebhook(rawBody: string, headers: Headers): WebhookEvent | null;
  /** Rembourse un paiement réussi. */
  refund(payment: ProviderPayment): Promise<void>;
}

// ─── Prestataire simulé (développement) ──────────────────────────────────────

/** Délais du simulateur, identiques au mode démo de l'app. */
export const SIM_CONFIRM_MS = 5_000;
export const SIM_FAIL_MS = 4_000;

type SimOutcome = 'succeed' | 'fail' | 'expire';

/** Issue décidée par la fin du numéro débité : …0002 refusé, …0003 jamais confirmé, sinon confirmé. */
export function simulatedOutcome(phone: string): SimOutcome {
  if (phone.endsWith('0002')) return 'fail';
  if (phone.endsWith('0003')) return 'expire';
  return 'succeed';
}

const HINTS = {
  mixx: 'Validez la demande Mixx by Yas reçue sur votre téléphone avec votre code secret.',
  flooz: 'Validez la demande Flooz reçue sur votre téléphone avec votre code secret.',
} as const;

export const FAILURE_REASONS = {
  failed: 'Solde insuffisant ou paiement refusé. Vérifiez votre compte puis réessayez.',
  expired: 'Délai de confirmation dépassé.',
} as const;

/** Secret des webhooks : PAYMENT_WEBHOOK_SECRET, sinon dérivé d'AUTH_SECRET (développement). */
export function webhookSecret(): string {
  return env().PAYMENT_WEBHOOK_SECRET ?? createHmac('sha256', env().AUTH_SECRET).update('payment-webhook').digest('base64url');
}

export const SIGNATURE_HEADER = 'x-afrisime-signature';
export const signWebhook = (rawBody: string) => createHmac('sha256', webhookSecret()).update(rawBody).digest('hex');

export const simulatedProvider: PaymentProvider = {
  name: 'simulated',

  async initiate(payment) {
    return {
      reference: `sim_${payment.id}`,
      data: { outcome: simulatedOutcome(payment.phone) },
      action: { type: 'confirm_on_phone', url: null, instructions: HINTS[payment.method] },
    };
  },

  async fetchStatus(payment, now) {
    const outcome = (payment.providerData as { outcome?: SimOutcome } | null)?.outcome ?? 'succeed';
    const elapsed = now.getTime() - payment.createdAt.getTime();
    if (outcome === 'succeed' && elapsed >= SIM_CONFIRM_MS) return { status: 'succeeded', failureReason: null };
    if (outcome === 'fail' && elapsed >= SIM_FAIL_MS) return { status: 'failed', failureReason: FAILURE_REASONS.failed };
    if (now >= payment.expiresAt) return { status: 'expired', failureReason: FAILURE_REASONS.expired };
    return { status: 'pending', failureReason: null };
  },

  parseWebhook(rawBody, headers) {
    const signature = headers.get(SIGNATURE_HEADER) ?? '';
    if (!safeEqual(signature, signWebhook(rawBody))) return null;
    try {
      const e = JSON.parse(rawBody) as Partial<WebhookEvent>;
      const statuses: ProviderStatus[] = ['pending', 'succeeded', 'failed', 'expired'];
      if (typeof e.eventId !== 'string' || typeof e.reference !== 'string' || !statuses.includes(e.status as ProviderStatus)) {
        return null;
      }
      return {
        eventId: e.eventId,
        reference: e.reference,
        status: e.status as ProviderStatus,
        failureReason: typeof e.failureReason === 'string' ? e.failureReason : null,
      };
    } catch {
      return null;
    }
  },

  async refund() {
    // Simulation : le remboursement est immédiat.
  },
};

let override: PaymentProvider | null = null;

/** Tests : remplace le prestataire. */
export function setPaymentProvider(provider: PaymentProvider | null) {
  override = provider;
}

export function paymentProvider(name?: string): PaymentProvider {
  if (override) return override;
  const wanted = name ?? env().PAYMENT_PROVIDER;
  switch (wanted) {
    case 'simulated':
      return simulatedProvider;
    default:
      throw new Error(`Prestataire de paiement inconnu : ${wanted}`);
  }
}
