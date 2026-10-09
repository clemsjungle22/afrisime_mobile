import { z } from 'zod';
import { Fulfillment } from './checkout';
import { Money } from './money';
import { OrderStatus } from './orders';

/**
 * Contrat du back-office pour les clients (/v1/admin/customers) :
 * liste, fiche, validation des comptes pros, tarif, blocage.
 */

export const CustomerStatus = z.enum(['active', 'blocked']);
export type CustomerStatus = z.infer<typeof CustomerStatus>;

export const PriceSegment = z.enum(['retail', 'pro']);
export type PriceSegment = z.infer<typeof PriceSegment>;

export const PRICE_SEGMENT_LABELS: Record<PriceSegment, string> = {
  retail: 'Particulier',
  pro: 'Professionnel',
};

/** Filtres de la liste (onglets). */
export const AdminCustomerFilter = z.enum(['all', 'pending_pro', 'pro', 'retail', 'blocked']);
export type AdminCustomerFilter = z.infer<typeof AdminCustomerFilter>;

export const ADMIN_CUSTOMER_FILTER_LABELS: Record<AdminCustomerFilter, string> = {
  all: 'Tous',
  pending_pro: 'Pros à valider',
  pro: 'Tarif pro',
  retail: 'Tarif particulier',
  blocked: 'Bloqués',
};

/** GET /v1/admin/customers */
export const AdminCustomerListQuery = z.object({
  filter: AdminCustomerFilter.default('all'),
  /** Nom, prénom ou téléphone (même partiel). */
  q: z.string().trim().max(80).optional(),
  cursor: z.string().optional(),
});
export type AdminCustomerListQuery = z.infer<typeof AdminCustomerListQuery>;

export const AdminCustomerRow = z.object({
  id: z.string(),
  name: z.string().nullable(),
  phone: z.string(),
  email: z.string().nullable(),
  /** Profil déclaré par le client dans l'app. */
  customerType: z.object({ id: z.string(), label: z.string() }).nullable(),
  /** Profil pro déclaré, en attente de validation par l'équipe. */
  typePending: z.boolean(),
  /** Tarif appliqué. */
  segment: PriceSegment,
  agencyName: z.string().nullable(),
  status: CustomerStatus,
  orderCount: z.number().int().nonnegative(),
  /** Total des commandes livrées ou retirées. */
  totalSpent: Money,
  lastOrderAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type AdminCustomerRow = z.infer<typeof AdminCustomerRow>;

export const AdminCustomerList = z.object({
  items: z.array(AdminCustomerRow),
  nextCursor: z.string().nullable(),
  /** Nombre de clients par filtre, avec la même recherche. */
  counts: z.record(AdminCustomerFilter, z.number().int().nonnegative()),
});
export type AdminCustomerList = z.infer<typeof AdminCustomerList>;

/** Actions proposées par le serveur selon le compte et le rôle. */
export const AdminCustomerAction = z.enum(['review_pro', 'change_pricing', 'block', 'unblock']);
export type AdminCustomerAction = z.infer<typeof AdminCustomerAction>;

export const AdminCustomerDetail = AdminCustomerRow.extend({
  marketingConsent: z.boolean(),
  /** Solde d'avoir (carnet abandonné…), utilisable à la commande. */
  storeCreditBalance: Money,
  /** Dernière utilisation de l'app (session la plus récente). */
  lastSeenAt: z.string().datetime().nullable(),
  /** Moyenne des commandes livrées ou retirées (0 sans commande). */
  averageBasket: Money,
  addresses: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      recipientName: z.string(),
      phone: z.string(),
      district: z.string(),
      city: z.string(),
      landmark: z.string(),
      instructions: z.string().nullable(),
      zoneName: z.string().nullable(),
      isDefault: z.boolean(),
    }),
  ),
  orders: z.array(
    z.object({
      id: z.string(),
      orderNumber: z.string(),
      status: OrderStatus,
      createdAt: z.string().datetime(),
      fulfillment: Fulfillment,
      total: Money,
    }),
  ),
  /** Ce qui s'est passé sur le compte (équipe et client), le plus récent d'abord. */
  history: z.array(
    z.object({
      at: z.string().datetime(),
      label: z.string(),
      /** Membre de l'équipe ; null : le client lui-même. */
      actorName: z.string().nullable(),
      reason: z.string().nullable(),
    }),
  ),
  /** Profils possibles (pour changer le profil ou le tarif). */
  customerTypes: z.array(z.object({ id: z.string(), label: z.string(), segment: PriceSegment })),
  allowedActions: z.array(AdminCustomerAction),
});
export type AdminCustomerDetail = z.infer<typeof AdminCustomerDetail>;

const Reason = z.string().trim().min(3, 'Indiquez un motif (3 caractères minimum)').max(300);

/** POST /v1/admin/customers/{id}/review : valider ou refuser un profil pro déclaré. */
export const AdminReviewProBody = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((b) => b.decision === 'approve' || (b.reason?.length ?? 0) >= 3, {
    message: 'Indiquez le motif du refus',
    path: ['reason'],
  });
export type AdminReviewProBody = z.infer<typeof AdminReviewProBody>;

/** POST /v1/admin/customers/{id}/pricing : changer le profil et le tarif à la main. */
export const AdminPricingBody = z.object({
  customerTypeId: z.string(),
  segment: PriceSegment,
  reason: Reason,
});
export type AdminPricingBody = z.infer<typeof AdminPricingBody>;

/** POST /v1/admin/customers/{id}/block (et /unblock). */
export const AdminBlockBody = z.object({ reason: Reason });
export type AdminBlockBody = z.infer<typeof AdminBlockBody>;
