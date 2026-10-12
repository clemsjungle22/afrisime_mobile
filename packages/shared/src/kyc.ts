import { z } from 'zod';
import { Money } from './money';

/**
 * Vérification d'identité (KYC) : au-delà d'un seuil d'achats sur 30 jours (réglé par l'équipe), le
 * client envoie sa pièce d'identité (recto, verso) et un selfie ; l'équipe valide ou refuse.
 * Tant que ce n'est pas validé, il ne peut pas commander au-delà du seuil.
 */

export const KYC_WINDOW_DAYS = 30;

export const KycStatus = z.enum(['none', 'pending', 'verified', 'rejected']);
export type KycStatus = z.infer<typeof KycStatus>;

export const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  none: 'Non vérifiée',
  pending: 'En cours de vérification',
  verified: 'Identité vérifiée',
  rejected: 'Refusée',
};

export const KycDocType = z.enum(['cni', 'passport', 'voter_card', 'driving_licence']);
export type KycDocType = z.infer<typeof KycDocType>;

export const KYC_DOC_LABELS: Record<KycDocType, string> = {
  cni: 'Carte nationale d’identité',
  passport: 'Passeport',
  voter_card: 'Carte d’électeur',
  driving_licence: 'Permis de conduire',
};

/** Photos demandées : le passeport n'a pas de verso. */
export const KycPhoto = z.enum(['front', 'back', 'selfie']);
export type KycPhoto = z.infer<typeof KycPhoto>;

export const KYC_PHOTO_LABELS: Record<KycPhoto, string> = {
  front: 'Recto de la pièce',
  back: 'Verso de la pièce',
  selfie: 'Selfie (votre visage)',
};

export const kycPhotosFor = (doc: KycDocType): KycPhoto[] =>
  doc === 'passport' ? ['front', 'selfie'] : ['front', 'back', 'selfie'];

/** GET /v1/me/kyc */
export const KycState = z.object({
  status: KycStatus,
  /** Seuil d'achats sur 30 jours (0 : pas de contrôle). */
  threshold: Money,
  /** Achats des 30 derniers jours. */
  spent30d: Money,
  /** Peut encore acheter sans vérification. */
  remainingBeforeKyc: Money.nullable(),
  docType: KycDocType.nullable(),
  submittedAt: z.string().datetime().nullable(),
  /** Motif du refus. */
  reason: z.string().nullable(),
});
export type KycState = z.infer<typeof KycState>;

/**
 * POST /v1/me/kyc (multipart) : champs « docType », « docNumber » et fichiers « front », « back »
 * (sauf passeport) et « selfie ». Photos JPEG, PNG ou WebP, 8 Mo au plus chacune.
 */
export const KycSubmitFields = z.object({
  docType: KycDocType,
  docNumber: z.string().trim().min(4, 'Numéro de la pièce trop court').max(40),
});
export type KycSubmitFields = z.infer<typeof KycSubmitFields>;

export const KYC_MAX_BYTES = 8 * 1024 * 1024;

/** Détails de l'erreur KYC_REQUIRED. */
export const KycRequiredDetails = z.object({
  threshold: Money,
  spent30d: Money,
  status: KycStatus,
});
export type KycRequiredDetails = z.infer<typeof KycRequiredDetails>;

/** Achats au-delà du seuil sans identité vérifiée ? (seuil 0 : jamais). */
export function kycBlocks(input: {
  threshold: number;
  spent30d: number;
  orderTotal: number;
  status: KycStatus;
}): boolean {
  return (
    input.threshold > 0 &&
    input.status !== 'verified' &&
    input.spent30d + input.orderTotal > input.threshold
  );
}

/** Back-office : dossier d'identité d'un client. */
export const AdminKyc = z.object({
  status: KycStatus,
  docType: KycDocType.nullable(),
  docNumber: z.string().nullable(),
  submittedAt: z.string().datetime().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  reviewedBy: z.string().nullable(),
  reason: z.string().nullable(),
  /** Photos consultables par l'équipe (adresses protégées, valables quelques minutes). */
  photos: z.array(z.object({ kind: KycPhoto, url: z.string() })),
  spent30d: Money,
  threshold: Money,
});
export type AdminKyc = z.infer<typeof AdminKyc>;

/** POST /v1/admin/customers/{id}/kyc : valider ou refuser (motif obligatoire). */
export const AdminKycReviewBody = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.decision === 'approve' || (v.reason?.length ?? 0) >= 3, {
    message: 'Indiquez le motif du refus',
    path: ['reason'],
  });
export type AdminKycReviewBody = z.infer<typeof AdminKycReviewBody>;
