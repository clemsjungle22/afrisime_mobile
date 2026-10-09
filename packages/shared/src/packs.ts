import { z } from 'zod';
import { PhoneE164 } from './auth';
import { HexColor, MediaUrl } from './catalog';
import { Money } from './money';
import { findVariant } from './cartEngine';
import type { ProductDetail } from './catalog';
import { PaymentAction } from './orders';

/**
 * Packs Famille et carnets de cotisation (/v1/packs, /v1/me/carnets).
 * Le client cotise chaque jour jusqu'à l'échéance, puis reçoit les produits du pack.
 * Contenu et prix sont figés le jour de la souscription.
 */

const DAY_MS = 86_400_000;

/** Montant minimum d'une cotisation (sauf pour solder le reste). */
export const MIN_CONTRIBUTION = 100;
/** Carnets en cours au maximum par client. */
export const MAX_ACTIVE_CARNETS = 3;

/** Produit d'un pack, tel qu'affiché (nom et format figés à la souscription pour un carnet). */
export const PackItemView = z.object({
  variantId: z.string(),
  quantity: z.number().int().positive(),
  productSlug: z.string(),
  productName: z.string(),
  brand: z.string(),
  variantLabel: z.string(),
  imageUrl: MediaUrl.nullable(),
  color: HexColor,
});
export type PackItemView = z.infer<typeof PackItemView>;

export const Pack = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: MediaUrl.nullable(),
  items: z.array(PackItemView),
  price: Money,
  durationDays: z.number().int().positive(),
  /** Cotisation journalière (prix ÷ jours, arrondi au franc supérieur). */
  dailyAmount: Money,
  /** Valeur des produits aux prix du jour (null si un produit n'a pas de prix). */
  catalogValue: Money.nullable(),
});
export type Pack = z.infer<typeof Pack>;

export const PackList = z.object({ items: z.array(Pack) });
export type PackList = z.infer<typeof PackList>;

export const CarnetStatus = z.enum(['active', 'completed', 'delivered', 'abandoned']);
export type CarnetStatus = z.infer<typeof CarnetStatus>;

export const CARNET_STATUS_LABELS: Record<CarnetStatus, string> = {
  active: 'En cours',
  completed: 'Soldé, à remettre',
  delivered: 'Remis',
  abandoned: 'Abandonné',
};

export const ContributionMethod = z.enum(['mixx', 'flooz', 'cash']);
export type ContributionMethod = z.infer<typeof ContributionMethod>;

export const CONTRIBUTION_METHOD_LABELS: Record<ContributionMethod, string> = {
  mixx: 'Mixx by Yas',
  flooz: 'Moov Money (Flooz)',
  cash: 'En agence',
};

export const ContributionStatus = z.enum(['pending', 'succeeded', 'failed', 'expired']);
export type ContributionStatus = z.infer<typeof ContributionStatus>;

export const Contribution = z.object({
  id: z.string(),
  amount: Money,
  method: ContributionMethod,
  status: ContributionStatus,
  createdAt: z.string().datetime(),
  settledAt: z.string().datetime().nullable(),
  /** Agence où l'espèce a été versée. */
  agencyName: z.string().nullable(),
  failureReason: z.string().nullable(),
  /** Paiement Mobile Money en attente : ce que le client doit faire sur son téléphone. */
  action: PaymentAction.nullable(),
});
export type Contribution = z.infer<typeof Contribution>;

export const Carnet = z.object({
  id: z.string(),
  packId: z.string(),
  name: z.string(),
  imageUrl: MediaUrl.nullable(),
  items: z.array(PackItemView),
  price: Money,
  durationDays: z.number().int().positive(),
  dailyAmount: Money,
  paid: Money,
  remaining: Money,
  status: CarnetStatus,
  startedAt: z.string().datetime(),
  /** Échéance prévue (début + durée). */
  dueAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  /** Délai maximum : au-delà, le carnet est clos et les sommes versées deviennent un avoir. */
  deadlineAt: z.string().datetime(),
  /** Commande créée à la remise du pack. */
  orderId: z.string().nullable(),
  /** Montant transformé en avoir (abandon ou délai dépassé). */
  creditedAmount: Money,
  /** Montant qui devrait être versé aujourd'hui pour être à jour. */
  expectedToDate: Money,
  /** Jours de cotisation de retard (0 : à jour). */
  daysLate: z.number().int().nonnegative(),
  /** Cotisation Mobile Money en attente de confirmation, s'il y en a une. */
  pendingContribution: Contribution.nullable(),
  /** Historique, le plus récent d'abord. */
  contributions: z.array(Contribution),
});
export type Carnet = z.infer<typeof Carnet>;

export const CarnetList = z.object({ items: z.array(Carnet) });
export type CarnetList = z.infer<typeof CarnetList>;

/** POST /v1/me/carnets (Idempotency-Key obligatoire). */
export const SubscribeBody = z.object({ packId: z.string() });
export type SubscribeBody = z.infer<typeof SubscribeBody>;

/** Délai maximum d'un carnet : deux fois sa durée. */
export const CARNET_DEADLINE_FACTOR = 2;

/** POST /v1/me/carnets/{id}/redeem (Idempotency-Key obligatoire) : recevoir le pack soldé. */
export const RedeemBody = z
  .object({
    fulfillment: z.enum(['delivery', 'pickup']),
    addressId: z.string().nullable(),
    agencyId: z.string().nullable(),
    slotId: z.string(),
  })
  .refine((b) => (b.fulfillment === 'delivery' ? b.addressId !== null : b.agencyId !== null), {
    message: 'Adresse ou agence requise selon le mode de réception',
  });
export type RedeemBody = z.infer<typeof RedeemBody>;

/** Avoir du client : solde et mouvements (le plus récent d'abord). */
export const StoreCreditReason = z.enum(['carnet_abandoned', 'carnet_expired', 'order', 'order_cancelled', 'adjustment']);
export type StoreCreditReason = z.infer<typeof StoreCreditReason>;

export const STORE_CREDIT_REASON_LABELS: Record<StoreCreditReason, string> = {
  carnet_abandoned: 'Carnet abandonné',
  carnet_expired: 'Carnet clos (délai dépassé)',
  order: 'Utilisé pour une commande',
  order_cancelled: 'Commande annulée : avoir rendu',
  adjustment: 'Ajustement par l’équipe',
};

export const StoreCredit = z.object({
  balance: Money,
  entries: z.array(
    z.object({
      id: z.string(),
      amount: z.number().int(),
      reason: StoreCreditReason,
      label: z.string(),
      at: z.string().datetime(),
    }),
  ),
});
export type StoreCredit = z.infer<typeof StoreCredit>;

/** POST /v1/me/carnets/{id}/contributions (Idempotency-Key obligatoire). */
export const ContributeBody = z.object({
  amount: z.number().int().min(1),
  method: z.enum(['mixx', 'flooz']),
  phone: PhoneE164,
});
export type ContributeBody = z.infer<typeof ContributeBody>;

// ─── Calculs communs (serveur et mode démo) ──────────────────────────────────

export const dailyAmountOf = (price: number, durationDays: number) =>
  Math.ceil(price / Math.max(1, durationDays));

/** Jour de cotisation en cours (1 le jour de la souscription), en jours de Lomé (UTC). */
function dayNumber(startedAt: Date, now: Date): number {
  const start = Date.UTC(
    startedAt.getUTCFullYear(),
    startedAt.getUTCMonth(),
    startedAt.getUTCDate(),
  );
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(1, Math.floor((today - start) / DAY_MS) + 1);
}

/**
 * Où en est un carnet : montant attendu à ce jour et retard en jours.
 * Le jour J, le client a jusqu'au soir pour cotiser : seuls les jours passés comptent dans le retard.
 */
export function carnetProgress(
  carnet: {
    price: number;
    dailyAmount: number;
    paid: number;
    startedAt: Date;
    status: CarnetStatus;
  },
  now: Date,
): { expectedToDate: number; daysLate: number; remaining: number } {
  const remaining = Math.max(0, carnet.price - carnet.paid);
  if (carnet.status !== 'active') return { expectedToDate: carnet.price, daysLate: 0, remaining };
  const day = dayNumber(carnet.startedAt, now);
  const expectedToDate = Math.min(carnet.price, carnet.dailyAmount * day);
  const owedBeforeToday = Math.min(carnet.price, carnet.dailyAmount * (day - 1));
  const daysLate =
    owedBeforeToday > carnet.paid
      ? Math.ceil((owedBeforeToday - carnet.paid) / carnet.dailyAmount)
      : 0;
  return { expectedToDate, daysLate, remaining };
}

/** Montant d'une cotisation : au moins MIN_CONTRIBUTION (ou le reste s'il est plus petit), jamais plus que le reste. */
export function contributionError(amount: number, remaining: number): string | null {
  if (remaining <= 0) return 'Ce carnet est déjà soldé.';
  if (amount > remaining) return `Il ne reste que ${remaining} F à verser.`;
  if (amount < Math.min(MIN_CONTRIBUTION, remaining))
    return `Cotisation minimum : ${MIN_CONTRIBUTION} F.`;
  return null;
}

/** Produits d'un pack tels qu'affichés (les formats retirés du catalogue sont ignorés). */
export function packItemsView(
  items: readonly { variantId: string; quantity: number }[],
  products: ProductDetail[],
): PackItemView[] {
  return items.flatMap((item) => {
    const found = findVariant(products, item.variantId);
    if (!found) return [];
    const { product, variant } = found;
    return [
      {
        variantId: variant.id,
        quantity: item.quantity,
        productSlug: product.slug,
        productName: product.name,
        brand: product.brand,
        variantLabel: variant.label,
        imageUrl: product.imageUrl,
        color: product.color,
      },
    ];
  });
}

/** Valeur des produits aux prix publics du jour (null si un format n'a pas de prix ou n'existe plus). */
export function catalogValue(
  items: readonly { variantId: string; quantity: number }[],
  products: ProductDetail[],
): number | null {
  let total = 0;
  for (const item of items) {
    const price = findVariant(products, item.variantId)?.variant.price ?? null;
    if (price === null) return null;
    total += price * item.quantity;
  }
  return total;
}
