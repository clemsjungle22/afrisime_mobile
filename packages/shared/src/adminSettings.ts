import { z } from 'zod';
import { AdminRole } from './admin';
import { PriceSegment } from './adminCustomers';
import { Money } from './money';
import { SlotConfig } from './slotConfig';

/**
 * Contrat du back-office pour les paramètres (/v1/admin/settings/*, /v1/admin/team) :
 * livraison, créneaux, agences, profils clients, équipe. Réservé à l'administrateur.
 */

const Name = z.string().trim().min(2, 'Au moins 2 caractères').max(80);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const AdminMoveBody = z.object({ direction: z.enum(['up', 'down']) });
export type AdminMoveBody = z.infer<typeof AdminMoveBody>;

// ─── Livraison ───────────────────────────────────────────────────────────────

export const AdminZone = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  fee: Money,
  cashOnDelivery: z.boolean(),
  districts: z.array(z.string()),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  /** Adresses de clients rattachées à cette zone. */
  addressCount: z.number().int().nonnegative(),
});
export type AdminZone = z.infer<typeof AdminZone>;

export const AdminZoneInput = z.object({
  name: Name,
  city: z.string().trim().min(2).max(60),
  fee: z.number().int().min(0, 'Frais positifs ou nuls').max(1_000_000),
  cashOnDelivery: z.boolean(),
  districts: z
    .array(z.string().trim().min(2).max(60))
    .min(1, 'Indiquez au moins un quartier')
    .max(200),
  isActive: z.boolean(),
});
export type AdminZoneInput = z.infer<typeof AdminZoneInput>;

/** Règles commerciales du checkout (montants en FCFA, délai en minutes). */
export const AdminCheckoutRules = z.object({
  freeAbove: z.number().int().min(0).max(100_000_000),
  minOrder: z.number().int().min(0).max(100_000_000),
  cashOnDeliveryMax: z.number().int().min(0).max(100_000_000),
  leadTimeMinutes: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 60),
});
export type AdminCheckoutRules = z.infer<typeof AdminCheckoutRules>;

export const AdminDeliverySettings = z.object({
  zones: z.array(AdminZone),
  rules: AdminCheckoutRules,
});
export type AdminDeliverySettings = z.infer<typeof AdminDeliverySettings>;

// ─── Créneaux ────────────────────────────────────────────────────────────────

export const AdminSlotSettings = SlotConfig;
export type AdminSlotSettings = SlotConfig;

// ─── Agences ─────────────────────────────────────────────────────────────────

export const AdminAgency = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
  phone: z.string().nullable(),
  openingHours: z.string().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  /** Clients rattachés à l'agence. */
  customerCount: z.number().int().nonnegative(),
});
export type AdminAgency = z.infer<typeof AdminAgency>;

export const AdminAgencyInput = z.object({
  name: Name,
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().min(3, 'Indiquez l’adresse').max(200),
  phone: optionalText(30),
  openingHours: optionalText(120),
  isActive: z.boolean(),
});
export type AdminAgencyInput = z.infer<typeof AdminAgencyInput>;

// ─── Profils clients ─────────────────────────────────────────────────────────

export const AdminCustomerType = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  requiresReview: z.boolean(),
  segment: PriceSegment,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  customerCount: z.number().int().nonnegative(),
});
export type AdminCustomerType = z.infer<typeof AdminCustomerType>;

export const AdminCustomerTypeInput = z.object({
  label: Name,
  description: optionalText(200),
  requiresReview: z.boolean(),
  segment: PriceSegment,
  isActive: z.boolean(),
});
export type AdminCustomerTypeInput = z.infer<typeof AdminCustomerTypeInput>;

// ─── Équipe ──────────────────────────────────────────────────────────────────

export const TeamMemberStatus = z.enum(['active', 'disabled']);
export type TeamMemberStatus = z.infer<typeof TeamMemberStatus>;

export const AdminTeamMember = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: AdminRole,
  status: TeamMemberStatus,
  /** Mot de passe provisoire pas encore changé. */
  mustChangePassword: z.boolean(),
  totpEnabled: z.boolean(),
  /** Bloqué après trop d'essais, jusqu'à cette date. */
  lockedUntil: z.string().datetime().nullable(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  /** Le compte de la personne connectée. */
  isSelf: z.boolean(),
});
export type AdminTeamMember = z.infer<typeof AdminTeamMember>;

export const AdminTeamCreate = z.object({
  name: Name,
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(160),
  role: AdminRole,
});
export type AdminTeamCreate = z.infer<typeof AdminTeamCreate>;

export const AdminTeamUpdate = z
  .object({ role: AdminRole.optional(), status: TeamMemberStatus.optional() })
  .refine((b) => b.role !== undefined || b.status !== undefined, {
    message: 'Rien à modifier',
  });
export type AdminTeamUpdate = z.infer<typeof AdminTeamUpdate>;

/** Création ou réinitialisation : mot de passe provisoire montré une seule fois. */
export const AdminTeamCredentials = z.object({
  member: AdminTeamMember,
  temporaryPassword: z.string(),
});
export type AdminTeamCredentials = z.infer<typeof AdminTeamCredentials>;
