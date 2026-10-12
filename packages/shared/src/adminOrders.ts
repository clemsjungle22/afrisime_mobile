import { z } from 'zod';
import { ValidatedCartLine } from './cart';
import { Fulfillment, GeoPoint, PaymentMethodId, Slot } from './checkout';
import { Money } from './money';
import { OrderStatus, PaymentStatus } from './orders';

/**
 * Contrat du back-office pour les commandes (/v1/admin/orders).
 */

/** Onglets de la liste : regroupent les statuts par ce que l'équipe doit faire. */
export const AdminOrderTab = z.enum([
  'to_prepare',
  'preparing',
  'dispatch',
  'awaiting_payment',
  'done',
  'cancelled',
  'all',
]);
export type AdminOrderTab = z.infer<typeof AdminOrderTab>;

export const ADMIN_ORDER_TABS: Record<Exclude<AdminOrderTab, 'all'>, readonly OrderStatus[]> = {
  to_prepare: ['confirmed'],
  preparing: ['preparing'],
  dispatch: ['ready_for_pickup', 'out_for_delivery'],
  awaiting_payment: ['pending_payment', 'payment_failed'],
  done: ['delivered', 'completed'],
  cancelled: ['cancelled', 'refunded'],
};

export const ADMIN_ORDER_TAB_LABELS: Record<AdminOrderTab, string> = {
  to_prepare: 'À préparer',
  preparing: 'En préparation',
  dispatch: 'Prêtes / en livraison',
  awaiting_payment: 'Attente de paiement',
  done: 'Terminées',
  cancelled: 'Annulées',
  all: 'Toutes',
};

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ');

/** GET /v1/admin/orders */
export const AdminOrderListQuery = z.object({
  tab: AdminOrderTab.default('to_prepare'),
  /** Numéro de commande, téléphone ou nom du client. */
  q: z.string().trim().max(80).optional(),
  fulfillment: Fulfillment.optional(),
  agencyId: z.string().optional(),
  paymentMethod: PaymentMethodId.optional(),
  /** Commandes passées à partir de ce jour (inclus), heure de Lomé. */
  from: Day.optional(),
  /** … jusqu'à ce jour (inclus). */
  to: Day.optional(),
  cursor: z.string().optional(),
});
export type AdminOrderListQuery = z.infer<typeof AdminOrderListQuery>;

export const AdminCustomerRef = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string(),
});

export const AdminOrderRow = z.object({
  id: z.string(),
  orderNumber: z.string(),
  status: OrderStatus,
  createdAt: z.string().datetime(),
  customer: AdminCustomerRef,
  fulfillment: Fulfillment,
  fulfillmentSummary: z.string(),
  slot: Slot,
  total: Money,
  itemCount: z.number().int().nonnegative(),
  paymentMethod: PaymentMethodId,
  paymentStatus: PaymentStatus,
  /** Montant à encaisser à la remise (paiement à la livraison ou en agence), 0 sinon. */
  amountDue: Money,
});
export type AdminOrderRow = z.infer<typeof AdminOrderRow>;

export const AdminOrderList = z.object({
  items: z.array(AdminOrderRow),
  nextCursor: z.string().nullable(),
  /** Nombre de commandes par onglet, avec les mêmes filtres (hors onglet). */
  counts: z.record(AdminOrderTab, z.number().int().nonnegative()),
});
export type AdminOrderList = z.infer<typeof AdminOrderList>;

/** Actions possibles sur une commande, proposées par le serveur selon le statut et le rôle. */
export const AdminOrderAction = z.enum([
  'start_preparing',
  'mark_ready',
  'dispatch',
  'delivery_failed',
  'mark_delivered',
  'complete_pickup',
  'collect_payment',
  'cancel',
  'add_note',
]);
export type AdminOrderAction = z.infer<typeof AdminOrderAction>;

/** Actions qui font changer d'étape (POST /v1/admin/orders/{id}/transition). */
export const AdminTransitionAction = AdminOrderAction.extract([
  'start_preparing',
  'mark_ready',
  'dispatch',
  'delivery_failed',
  'mark_delivered',
  'complete_pickup',
]);
export type AdminTransitionAction = z.infer<typeof AdminTransitionAction>;

export const AdminOrderDetail = AdminOrderRow.extend({
  lines: z.array(ValidatedCartLine),
  subtotal: Money,
  deliveryFee: Money,
  discountTotal: Money,
  /** Bonus Mobile Money déduit des frais de livraison. */
  deliveryBonus: Money.default(0),
  /** Avoir du client déduit du total. */
  storeCreditUsed: Money.default(0),
  customer: AdminCustomerRef.extend({ email: z.string().nullable(), segmentLabel: z.string() }),
  address: z
    .object({
      label: z.string(),
      recipientName: z.string(),
      phone: z.string(),
      district: z.string(),
      city: z.string(),
      landmark: z.string(),
      instructions: z.string().nullable(),
      location: GeoPoint.nullable(),
      zoneName: z.string().nullable(),
    })
    .nullable(),
  agency: z.object({ id: z.string(), name: z.string(), address: z.string() }).nullable(),
  /** Délai de paiement en ligne (commande annulée après). */
  paymentDeadline: z.string().datetime().nullable(),
  paidAt: z.string().datetime().nullable(),
  payments: z.array(
    z.object({
      id: z.string(),
      method: PaymentMethodId,
      provider: z.string(),
      status: PaymentStatus,
      amount: Money,
      phone: z.string().nullable(),
      createdAt: z.string().datetime(),
      failureReason: z.string().nullable(),
    }),
  ),
  history: z.array(
    z.object({
      status: OrderStatus,
      at: z.string().datetime(),
      /** Note visible par le client. */
      note: z.string().nullable(),
      /** Auteur : « Client », « Système » ou le nom du membre de l'équipe. */
      actor: z.string(),
    }),
  ),
  /** Notes internes (jamais visibles par le client). */
  notes: z.array(
    z.object({
      id: z.number().int(),
      text: z.string(),
      at: z.string().datetime(),
      author: z.string(),
    }),
  ),
  allowedActions: z.array(AdminOrderAction),
});
export type AdminOrderDetail = z.infer<typeof AdminOrderDetail>;

const Note = z.string().trim().max(300);

/** Toute action indique le statut affiché : si la commande a changé entre-temps → 409 ORDER_CHANGED. */
export const AdminTransitionBody = z.object({
  action: AdminTransitionAction,
  expectedStatus: OrderStatus,
  /** Note visible par le client (motif obligatoire pour un échec de livraison). */
  note: Note.optional(),
  /** Code présenté par le client au retrait. */
  pickupCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Le code de retrait compte 6 chiffres')
    .optional(),
});
export type AdminTransitionBody = z.infer<typeof AdminTransitionBody>;

export const AdminCollectBody = z.object({
  expectedStatus: OrderStatus,
  /** Montant reçu (doit correspondre au montant dû). */
  amount: Money,
});
export type AdminCollectBody = z.infer<typeof AdminCollectBody>;

export const AdminCancelBody = z.object({
  expectedStatus: OrderStatus,
  reason: z.string().trim().min(3, 'Indiquez le motif de l’annulation').max(300),
});
export type AdminCancelBody = z.infer<typeof AdminCancelBody>;

export const AdminNoteBody = z.object({ text: z.string().trim().min(1, 'Note vide').max(1000) });
