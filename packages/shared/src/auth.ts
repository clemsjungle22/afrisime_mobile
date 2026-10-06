import { z } from 'zod';

/** Numéro E.164 Togo. */
export const PhoneE164 = z.string().regex(/^\+228[79]\d{7}$/);

export const OtpCode = z.string().regex(/^\d{6}$/);

/** POST /v1/auth/otp/request */
export const OtpRequestBody = z.object({ phone: PhoneE164 });
export type OtpRequestBody = z.infer<typeof OtpRequestBody>;

export const OtpRequestResponse = z.object({
  requestId: z.string(),
  /** Durée de validité du code (secondes). */
  expiresIn: z.number().int().positive(),
  /** Délai avant de pouvoir redemander un code (secondes). */
  resendIn: z.number().int().nonnegative(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponse>;

export const DeviceInfo = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  model: z.string().nullable(),
  osVersion: z.string().nullable(),
  appVersion: z.string(),
});
export type DeviceInfo = z.infer<typeof DeviceInfo>;

/** POST /v1/auth/otp/verify */
export const OtpVerifyBody = z.object({
  requestId: z.string(),
  code: OtpCode,
  device: DeviceInfo,
});
export type OtpVerifyBody = z.infer<typeof OtpVerifyBody>;

/** Type de client déclaré. Le segment tarifaire reste attribué par le serveur. */
export const CustomerType = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  /** Le choix doit être validé par AfriSime avant d'activer les tarifs dédiés. */
  requiresReview: z.boolean(),
});
export type CustomerType = z.infer<typeof CustomerType>;

export const Agency = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  address: z.string(),
  phone: z.string().nullable(),
  openingHours: z.string().nullable(),
  isDefault: z.boolean(),
});
export type Agency = z.infer<typeof Agency>;

export const Consents = z.object({
  /** Offres et promotions (RB-008) : opt-in, révocable. */
  marketing: z.boolean(),
  /** Version des CGU acceptées, null si non acceptées. */
  termsVersion: z.string().nullable(),
});
export type Consents = z.infer<typeof Consents>;

export const UserProfile = z.object({
  id: z.string(),
  phone: PhoneE164,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.string().email().nullable(),
  customerTypeId: z.string().nullable(),
  /** Segment tarifaire attribué par le serveur (libellé). */
  segmentLabel: z.string(),
  /** Changement de type en attente de validation par AfriSime. */
  customerTypePending: z.boolean(),
  agencyId: z.string().nullable(),
  consents: Consents,
  /** Profil incomplet : afficher l'écran de configuration. */
  profileComplete: z.boolean(),
  createdAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof UserProfile>;

export const AuthTokens = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Durée de vie du jeton d'accès (secondes). */
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof AuthTokens>;

export const OtpVerifyResponse = AuthTokens.extend({
  user: UserProfile,
  isNewUser: z.boolean(),
});
export type OtpVerifyResponse = z.infer<typeof OtpVerifyResponse>;

/** POST /v1/auth/refresh */
export const RefreshBody = z.object({ refreshToken: z.string().min(1) });

/** PATCH /v1/me */
export const ProfileUpdateBody = z.object({
  firstName: z.string().trim().min(1, 'Indiquez votre prénom').max(60).optional(),
  lastName: z.string().trim().min(1, 'Indiquez votre nom').max(60).optional(),
  email: z.string().trim().email('Adresse e-mail invalide').nullable().optional(),
  customerTypeId: z.string().optional(),
  agencyId: z.string().optional(),
  consents: z
    .object({
      marketing: z.boolean().optional(),
      termsVersion: z.string().optional(),
    })
    .optional(),
});
export type ProfileUpdateBody = z.infer<typeof ProfileUpdateBody>;

/** Réponse de GET /v1/onboarding/options : listes paramétrables (RB-010). */
export const OnboardingOptions = z.object({
  customerTypes: z.array(CustomerType).min(1),
  agencies: z.array(Agency).min(1),
  termsVersion: z.string(),
  termsUrl: z.string().url(),
  privacyUrl: z.string().url(),
});
export type OnboardingOptions = z.infer<typeof OnboardingOptions>;
