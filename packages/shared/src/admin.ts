import { z } from 'zod';
import { Money } from './money';

/**
 * Contrat du back-office (/v1/admin/*). Comptes de l'équipe totalement séparés des comptes clients.
 */

/** Rôles de l'équipe : chaque adresse /v1/admin/* déclare les rôles autorisés. */
export const AdminRole = z.enum(['admin', 'catalog', 'orders', 'support', 'readonly']);
export type AdminRole = z.infer<typeof AdminRole>;

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  admin: 'Administrateur',
  catalog: 'Catalogue',
  orders: 'Commandes',
  support: 'Service client',
  readonly: 'Lecture seule',
};

/** Rôles pour lesquels le code de vérification (2FA) est obligatoire. */
export const ROLES_REQUIRING_TOTP: ReadonlySet<AdminRole> = new Set(['admin']);

export const ADMIN_PASSWORD_MIN = 12;

export const AdminProfile = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: AdminRole,
  totpEnabled: z.boolean(),
  /** Mot de passe provisoire : à changer avant toute autre action. */
  mustChangePassword: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
});
export type AdminProfile = z.infer<typeof AdminProfile>;

/** POST /v1/admin/auth/login */
export const AdminLoginBody = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide'),
  password: z.string().min(1, 'Indiquez votre mot de passe').max(200),
});
export type AdminLoginBody = z.infer<typeof AdminLoginBody>;

/** Session ouverte : le jeton est conservé par le serveur du back-office (cookie httpOnly). */
export const AdminSession = z.object({
  status: z.literal('authenticated'),
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  admin: AdminProfile,
});
export type AdminSession = z.infer<typeof AdminSession>;

/**
 * Réponse de connexion : session ouverte, ou étape de vérification à franchir
 * (code 2FA à saisir, ou 2FA à activer pour un rôle qui l'exige). `challengeId` vaut 5 minutes.
 */
export const AdminLoginResponse = z.discriminatedUnion('status', [
  AdminSession,
  z.object({ status: z.literal('totp_required'), challengeId: z.string() }),
  z.object({ status: z.literal('totp_setup_required'), challengeId: z.string() }),
]);
export type AdminLoginResponse = z.infer<typeof AdminLoginResponse>;

export const TotpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Le code compte 6 chiffres');

/** POST /v1/admin/auth/totp : code de l'application d'authentification. */
export const AdminTotpBody = z.object({ challengeId: z.string(), code: TotpCode });

/** POST /v1/admin/auth/totp/setup : secret à enregistrer dans l'application (QR code). */
export const AdminTotpSetupBody = z.object({ challengeId: z.string() });
export const AdminTotpSetupResponse = z.object({
  /** URI otpauth:// à afficher en QR code. */
  otpauthUri: z.string(),
  /** Même secret en texte (saisie manuelle si le scan est impossible). */
  secret: z.string(),
});
export type AdminTotpSetupResponse = z.infer<typeof AdminTotpSetupResponse>;

/** POST /v1/admin/auth/totp/confirm : premier code, qui prouve que l'application est bien configurée. */
export const AdminTotpConfirmBody = z.object({ challengeId: z.string(), code: TotpCode });

/** POST /v1/admin/me/password */
export const AdminChangePasswordBody = z
  .object({
    currentPassword: z.string().min(1, 'Indiquez votre mot de passe actuel'),
    newPassword: z
      .string()
      .min(ADMIN_PASSWORD_MIN, `Au moins ${ADMIN_PASSWORD_MIN} caractères`)
      .max(200),
  })
  .refine((b) => b.newPassword !== b.currentPassword, {
    message: "Le nouveau mot de passe doit être différent de l'actuel",
    path: ['newPassword'],
  });
export type AdminChangePasswordBody = z.infer<typeof AdminChangePasswordBody>;

// ─── Tableau de bord ─────────────────────────────────────────────────────────

export const AdminDashboard = z.object({
  /** Début de la journée de référence (UTC = heure de Lomé). */
  day: z.string().datetime(),
  ordersToday: z.number().int().nonnegative(),
  /** Encaissé aujourd'hui (paiements réussis, hors commandes remboursées). */
  revenueToday: Money,
  paidOrdersToday: z.number().int().nonnegative(),
  /** Commandes ouvertes par statut (à traiter). */
  openByStatus: z.array(z.object({ status: z.string(), count: z.number().int().nonnegative() })),
  /** Formats sous leur seuil d'alerte (ou en rupture). */
  lowStock: z.array(
    z.object({
      variantId: z.string(),
      productName: z.string(),
      variantLabel: z.string(),
      sellable: z.number().int(),
      threshold: z.number().int().nonnegative(),
    }),
  ),
  /** Comptes professionnels en attente de validation. */
  pendingProAccounts: z.number().int().nonnegative(),
});
export type AdminDashboard = z.infer<typeof AdminDashboard>;
