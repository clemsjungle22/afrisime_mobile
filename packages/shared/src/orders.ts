import { z } from 'zod';
import { PhoneE164 } from './auth';
import { ValidatedCartLine } from './cart';
import { Fulfillment, PaymentMethodId, Slot } from './checkout';
import { Money } from './money';

/**
 * Statuts de commande [à confirmer avec AfriSime] :
 * pending_payment → confirmed → preparing → out_for_delivery | ready_for_pickup → delivered | completed
 * + payment_failed, cancelled, refunded.
 */
export const OrderStatus = z.enum([
  'pending_payment',
  'payment_failed',
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

/** Statuts terminaux : la commande passe dans l'historique. */
export const FINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set(['delivered', 'completed', 'cancelled', 'refunded']);

export const PaymentStatus = z.enum(['initiated', 'pending', 'succeeded', 'failed', 'expired', 'refunded']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const OrderStatusEvent = z.object({
  status: OrderStatus,
  at: z.string().datetime(),
  /** Précision affichable (« Paiement Mixx by Yas reçu », « Annulée à votre demande »). */
  note: z.string().nullable(),
});
export type OrderStatusEvent = z.infer<typeof OrderStatusEvent>;

export const OrderPayment = z.object({
  method: PaymentMethodId,
  status: PaymentStatus,
  /** Dernière tentative, pour reprendre le suivi. */
  paymentId: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
});
export type OrderPayment = z.infer<typeof OrderPayment>;

export const OrderSummary = z.object({
  id: z.string(),
  /** Numéro lisible (AFS-2026-000123). */
  orderNumber: z.string(),
  status: OrderStatus,
  createdAt: z.string().datetime(),
  total: Money,
  itemCount: z.number().int().nonnegative(),
  fulfillment: Fulfillment,
  fulfillmentSummary: z.string(),
  slot: Slot,
  payable: z.boolean(),
});
export type OrderSummary = z.infer<typeof OrderSummary>;

export const Order = OrderSummary.extend({
  lines: z.array(ValidatedCartLine),
  subtotal: Money,
  deliveryFee: Money,
  discountTotal: Money,
  /** Avoir utilisé pour cette commande (rendu si elle est annulée). */
  storeCreditUsed: Money.default(0),
  currency: z.literal('XOF'),
  addressId: z.string().nullable(),
  agencyId: z.string().nullable(),
  /** Code à présenter en agence (retrait). */
  pickupCode: z.string().nullable(),
  payment: OrderPayment,
  history: z.array(OrderStatusEvent).min(1),
  /** Annulation autorisée maintenant (RB-009, décidé par le serveur). */
  cancellable: z.boolean(),
  /** Pour un paiement en attente : la commande est annulée si non payée avant cette date. */
  paymentDeadline: z.string().datetime().nullable(),
});
export type Order = z.infer<typeof Order>;

export const OrderList = z.object({
  items: z.array(OrderSummary),
  nextCursor: z.string().nullable(),
});
export type OrderList = z.infer<typeof OrderList>;

/** POST /v1/orders (+ Idempotency-Key). */
export const CreateOrderBody = z.object({ quoteId: z.string() });
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;

/** POST /v1/payments (+ Idempotency-Key). */
export const CreatePaymentBody = z.object({
  orderId: z.string(),
  method: PaymentMethodId,
  /** Numéro Mobile Money débité. */
  phone: PhoneE164.nullable(),
});
export type CreatePaymentBody = z.infer<typeof CreatePaymentBody>;

export const PaymentAction = z.object({
  type: z.enum(['confirm_on_phone', 'redirect', 'none']),
  url: z.string().url().nullable(),
  /** Instructions affichables (« Composez *145# puis validez »). */
  instructions: z.string().nullable(),
});
export type PaymentAction = z.infer<typeof PaymentAction>;

export const PaymentIntent = z.object({
  id: z.string(),
  orderId: z.string(),
  method: PaymentMethodId,
  status: PaymentStatus,
  amount: Money,
  action: PaymentAction,
  expiresAt: z.string().datetime(),
  /** Motif d'échec affichable. */
  failureReason: z.string().nullable(),
});
export type PaymentIntent = z.infer<typeof PaymentIntent>;

/** POST /v1/orders/:id/cancel */
export const CancelOrderBody = z.object({ reason: z.string().max(200).nullable() });

/** POST /v1/orders/:id/reorder → lignes à remettre dans le panier (revalidées ensuite). */
export const ReorderResponse = z.object({
  lines: z.array(ValidatedCartLine),
});
export type ReorderResponse = z.infer<typeof ReorderResponse>;
