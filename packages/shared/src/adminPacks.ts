import { z } from 'zod';
import { MediaUrl } from './catalog';
import { Money } from './money';
import { CarnetStatus, Contribution, PackItemView } from './packs';

/**
 * Contrat du back-office pour les packs et carnets (/v1/admin/packs, /v1/admin/carnets).
 */

export const AdminPack = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: MediaUrl.nullable(),
  items: z.array(PackItemView),
  price: Money,
  durationDays: z.number().int().positive(),
  dailyAmount: Money,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  /** Valeur des produits aux prix publics du jour (null si un produit n'a pas de prix). */
  catalogValue: Money.nullable(),
  activeCarnets: z.number().int().nonnegative(),
  totalCarnets: z.number().int().nonnegative(),
});
export type AdminPack = z.infer<typeof AdminPack>;

export const AdminPackInput = z.object({
  name: z.string().trim().min(2, 'Au moins 2 caractères').max(80),
  description: z
    .string()
    .trim()
    .max(400)
    .nullable()
    .transform((v) => (v ? v : null)),
  price: z.number().int().min(100, 'Prix minimum : 100 F').max(10_000_000),
  durationDays: z.number().int().min(1, 'Au moins 1 jour').max(365, '365 jours au maximum'),
  items: z
    .array(z.object({ variantId: z.string(), quantity: z.number().int().min(1).max(999) }))
    .min(1, 'Ajoutez au moins un produit')
    .max(30),
  isActive: z.boolean(),
});
export type AdminPackInput = z.infer<typeof AdminPackInput>;

/** Format proposable dans un pack (liste de choix du back-office). */
export const AdminPackFormat = z.object({
  variantId: z.string(),
  label: z.string(),
  brand: z.string(),
  price: Money.nullable(),
});
export type AdminPackFormat = z.infer<typeof AdminPackFormat>;

export const AdminCarnetFilter = z.enum([
  'all',
  'active',
  'late',
  'completed',
  'delivered',
  'abandoned',
]);
export type AdminCarnetFilter = z.infer<typeof AdminCarnetFilter>;

export const ADMIN_CARNET_FILTER_LABELS: Record<AdminCarnetFilter, string> = {
  all: 'Tous',
  active: 'En cours',
  late: 'En retard',
  completed: 'Soldés, à remettre',
  delivered: 'Remis',
  abandoned: 'Abandonnés',
};

export const AdminCarnetListQuery = z.object({
  filter: AdminCarnetFilter.default('active'),
  /** Nom ou téléphone du client, ou nom du pack. */
  q: z.string().trim().max(80).optional(),
  cursor: z.string().optional(),
});
export type AdminCarnetListQuery = z.infer<typeof AdminCarnetListQuery>;

export const AdminCarnetRow = z.object({
  id: z.string(),
  customer: z.object({ id: z.string(), name: z.string().nullable(), phone: z.string() }),
  packName: z.string(),
  price: Money,
  paid: Money,
  remaining: Money,
  dailyAmount: Money,
  status: CarnetStatus,
  daysLate: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type AdminCarnetRow = z.infer<typeof AdminCarnetRow>;

export const AdminCarnetList = z.object({
  items: z.array(AdminCarnetRow),
  nextCursor: z.string().nullable(),
  counts: z.record(AdminCarnetFilter, z.number().int().nonnegative()),
});
export type AdminCarnetList = z.infer<typeof AdminCarnetList>;

export const AdminCarnetDetail = AdminCarnetRow.extend({
  items: z.array(PackItemView),
  durationDays: z.number().int().positive(),
  contributions: z.array(
    Contribution.extend({
      /** Membre de l'équipe qui a enregistré l'espèce (null : Mobile Money). */
      recordedBy: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
  /** Encaisser une cotisation en espèces est possible (carnet en cours, rôle autorisé). */
  canRecordCash: z.boolean(),
});
export type AdminCarnetDetail = z.infer<typeof AdminCarnetDetail>;

/** POST /v1/admin/carnets/{id}/cash : cotisation reçue en espèces au comptoir. */
export const AdminCashBody = z.object({
  amount: z.number().int().min(1, 'Montant invalide'),
  agencyId: z.string().min(1, 'Choisissez l’agence'),
  note: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type AdminCashBody = z.infer<typeof AdminCashBody>;
