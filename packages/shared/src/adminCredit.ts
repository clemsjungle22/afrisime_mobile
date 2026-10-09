import { z } from 'zod';
import { CreditAccountStatus, CreditDebt, CreditRepayment, CreditRequestView } from './credit';
import { Money } from './money';

/** Back-office : vente à crédit (/v1/admin/credit). Une ligne par cliente ayant un crédit ou une demande. */

export const AdminCreditFilter = z.enum(['requests', 'active', 'late', 'suspended', 'all']);
export type AdminCreditFilter = z.infer<typeof AdminCreditFilter>;

export const ADMIN_CREDIT_FILTER_LABELS: Record<AdminCreditFilter, string> = {
  requests: 'Demandes',
  active: 'Crédits ouverts',
  late: 'En retard',
  suspended: 'Suspendus',
  all: 'Tous',
};

export const AdminCreditListQuery = z.object({
  filter: AdminCreditFilter.default('requests'),
  /** Nom ou téléphone de la cliente. */
  q: z.string().trim().max(80).optional(),
  cursor: z.string().optional(),
});
export type AdminCreditListQuery = z.infer<typeof AdminCreditListQuery>;

export const AdminCreditRow = z.object({
  customer: z.object({
    id: z.string(),
    name: z.string().nullable(),
    phone: z.string(),
    typeLabel: z.string(),
  }),
  status: CreditAccountStatus,
  limit: Money,
  used: Money,
  available: Money,
  termDays: z.number().int().nonnegative(),
  dueToday: Money,
  daysLate: z.number().int().nonnegative(),
  /** Demande en attente de réponse. */
  pendingRequest: CreditRequestView.nullable(),
  updatedAt: z.string().datetime(),
});
export type AdminCreditRow = z.infer<typeof AdminCreditRow>;

export const AdminCreditList = z.object({
  items: z.array(AdminCreditRow),
  nextCursor: z.string().nullable(),
  counts: z.record(AdminCreditFilter, z.number().int().nonnegative()),
});
export type AdminCreditList = z.infer<typeof AdminCreditList>;

export const AdminCreditDetail = AdminCreditRow.extend({
  /** Compte pro validé : seule condition pour accorder un crédit. */
  isProValidated: z.boolean(),
  grantedBy: z.string().nullable(),
  grantedAt: z.string().datetime().nullable(),
  suspendedReason: z.string().nullable(),
  debts: z.array(CreditDebt),
  repayments: z.array(
    CreditRepayment.extend({
      /** Membre de l'équipe qui a encaissé l'espèce (null : Mobile Money). */
      recordedBy: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
  requests: z.array(CreditRequestView),
  /** Accorder, modifier, suspendre, refuser : réservé aux rôles habilités. */
  canManage: z.boolean(),
  /** Encaisser un remboursement en espèces : il reste quelque chose à rembourser et le rôle le permet. */
  canRecordCash: z.boolean(),
});
export type AdminCreditDetail = z.infer<typeof AdminCreditDetail>;

/** PUT /v1/admin/credit/{customerId} : accorder ou modifier le crédit (accepte la demande en attente). */
export const AdminCreditGrantBody = z.object({
  limit: z.number().int().min(1_000, 'Plafond minimum : 1 000 F').max(10_000_000),
  termDays: z.number().int().min(1, 'Durée invalide').max(365, 'Durée maximum : 365 jours'),
});
export type AdminCreditGrantBody = z.infer<typeof AdminCreditGrantBody>;

/** POST /v1/admin/credit/{customerId}/reject : refuser la demande en attente. */
export const AdminCreditRejectBody = z.object({
  reason: z.string().trim().min(3, 'Indiquez le motif').max(300),
});
export type AdminCreditRejectBody = z.infer<typeof AdminCreditRejectBody>;

/** POST /v1/admin/credit/{customerId}/suspend : suspendre (motif) ou rétablir le crédit. */
export const AdminCreditSuspendBody = z.object({
  suspended: z.boolean(),
  reason: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type AdminCreditSuspendBody = z.infer<typeof AdminCreditSuspendBody>;

/** POST /v1/admin/credit/{customerId}/cash : remboursement reçu en espèces au comptoir. */
export const AdminCreditCashBody = z.object({
  amount: z.number().int().min(1, 'Montant invalide'),
  agencyId: z.string().min(1, 'Choisissez l’agence'),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type AdminCreditCashBody = z.infer<typeof AdminCreditCashBody>;
