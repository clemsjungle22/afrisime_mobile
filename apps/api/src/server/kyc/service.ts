import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  type AdminKyc,
  type AdminKycReviewBody,
  KYC_MAX_BYTES,
  KYC_WINDOW_DAYS,
  type KycDocType,
  type KycPhoto,
  type KycState,
  type KycStatus,
  KycSubmitFields,
  kycBlocks,
  kycPhotosFor,
} from '@afrisime/shared';
import { and, desc, eq, gte, notInArray, sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { AdminContext } from '../admin/auth';
import { adminAudit } from '../admin/auth';
import { loadRules } from '../checkout/rules';
import type { Db } from '../db/client';
import * as s from '../db/schema';
import { env } from '../env';
import { ApiError } from '../http/errors';
import { newId } from '../ids';
import { mediaStorage } from '../media';
import { notify } from '../notifications/service';

/**
 * Vérification d'identité (KYC) : au-delà d'un seuil d'achats sur 30 jours (réglé par l'équipe), le
 * client envoie sa pièce et un selfie ; l'équipe valide ou refuse. Les photos ne sont jamais publiques :
 * l'équipe les voit par des adresses signées, valables quelques minutes.
 */

const DAY_MS = 86_400_000;
/** Commandes qui ne comptent pas dans les achats (annulées, remboursées, paiement refusé). */
const NOT_COUNTED = ['cancelled', 'refunded', 'payment_failed'] as const;
/** Durée de validité d'une adresse de photo pour l'équipe. */
const PHOTO_URL_TTL_MS = 10 * 60_000;

const invalid = (message: string, field?: string) =>
  new ApiError('VALIDATION_ERROR', message, field ? { field } : undefined, 422);

/** Achats des 30 derniers jours (commandes en cours ou terminées). */
export async function spentLast30Days(
  db: Db,
  customerId: string,
  now = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${s.orders.total}), 0)::int` })
    .from(s.orders)
    .where(
      and(
        eq(s.orders.customerId, customerId),
        gte(s.orders.createdAt, new Date(now.getTime() - KYC_WINDOW_DAYS * DAY_MS)),
        notInArray(s.orders.status, [...NOT_COUNTED]),
      ),
    );
  return Number(row?.total ?? 0);
}

async function statusOf(db: Db, customerId: string): Promise<KycStatus> {
  const [c] = await db
    .select({ kycStatus: s.customers.kycStatus })
    .from(s.customers)
    .where(eq(s.customers.id, customerId));
  return (c?.kycStatus ?? 'none') as KycStatus;
}

/**
 * Refuse une commande qui ferait dépasser le seuil sans identité vérifiée (devis et commande).
 * Le message dit au client quoi faire.
 */
export async function assertKycAllows(
  db: Db,
  customerId: string,
  orderTotal: number,
  threshold: number,
  now = new Date(),
) {
  if (threshold <= 0) return;
  const [status, spent30d] = await Promise.all([
    statusOf(db, customerId),
    spentLast30Days(db, customerId, now),
  ]);
  if (!kycBlocks({ threshold, spent30d, orderTotal, status })) return;
  throw new ApiError(
    'KYC_REQUIRED',
    status === 'pending'
      ? 'Vos achats dépassent le plafond autorisé sans vérification : votre identité est en cours de vérification, réessayez dès qu’elle est validée.'
      : 'Vos achats dépassent le plafond autorisé sans vérification : vérifiez votre identité (pièce et selfie) pour continuer.',
    { threshold, spent30d, status },
    403,
  );
}

async function latest(db: Db, customerId: string) {
  const [row] = await db
    .select()
    .from(s.kycSubmissions)
    .where(eq(s.kycSubmissions.customerId, customerId))
    .orderBy(desc(s.kycSubmissions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getKycState(db: Db, customerId: string, now = new Date()): Promise<KycState> {
  const [rules, status, spent30d, last] = await Promise.all([
    loadRules(db),
    statusOf(db, customerId),
    spentLast30Days(db, customerId, now),
    latest(db, customerId),
  ]);
  const threshold = rules.kycThreshold ?? 0;
  return {
    status,
    threshold,
    spent30d,
    remainingBeforeKyc:
      threshold > 0 && status !== 'verified' ? Math.max(0, threshold - spent30d) : null,
    docType: (last?.docType as KycDocType | undefined) ?? null,
    submittedAt: last?.createdAt.toISOString() ?? null,
    reason: status === 'rejected' ? (last?.reason ?? null) : null,
  };
}

/** Photo d'identité : contenu vérifié, orientation corrigée, réduite (lisible), métadonnées retirées. */
async function storeKycPhoto(file: File): Promise<string> {
  if (file.size > KYC_MAX_BYTES) throw invalid('Photo trop lourde (8 Mo maximum).', 'file');
  const data = Buffer.from(await file.arrayBuffer());
  let format: string | undefined;
  try {
    format = (await sharp(data).metadata()).format;
  } catch {
    format = undefined;
  }
  if (!format || !['jpeg', 'png', 'webp', 'heif'].includes(format))
    throw invalid('Formats acceptés : JPEG, PNG ou WebP.', 'file');
  const processed = await sharp(data, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  // Nom imprévisible : la photo n'est de toute façon jamais servie par l'adresse publique.
  const key = `kyc/${randomBytes(16).toString('hex')}.webp`;
  await mediaStorage().put(key, processed, 'image/webp');
  return key;
}

/** Dépôt du dossier (formulaire multipart : docType, docNumber, front, back, selfie). */
export async function submitKyc(
  db: Db,
  customerId: string,
  req: Request,
  now = new Date(),
): Promise<KycState> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw invalid('Envoyez les photos dans un formulaire.');
  }
  const fields = KycSubmitFields.safeParse({
    docType: form.get('docType'),
    docNumber: form.get('docNumber'),
  });
  if (!fields.success)
    throw invalid(
      fields.error.issues[0]?.message ?? 'Pièce invalide.',
      String(fields.error.issues[0]?.path[0] ?? ''),
    );
  const status = await statusOf(db, customerId);
  if (status === 'verified') throw invalid('Votre identité est déjà vérifiée.');
  if (status === 'pending') throw invalid('Votre dossier est déjà en cours de vérification.');

  const photos: Partial<Record<KycPhoto, string>> = {};
  for (const kind of kycPhotosFor(fields.data.docType)) {
    const file = form.get(kind);
    if (!(file instanceof File) || file.size === 0)
      throw invalid(
        `Photo manquante : ${kind === 'selfie' ? 'selfie' : kind === 'front' ? 'recto' : 'verso'}.`,
        kind,
      );
    photos[kind] = await storeKycPhoto(file);
  }
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    await tx.insert(s.kycSubmissions).values({
      id: newId('kyc'),
      customerId,
      docType: fields.data.docType,
      docNumber: fields.data.docNumber,
      photos,
      createdAt: now,
    });
    await tx
      .update(s.customers)
      .set({ kycStatus: 'pending', updatedAt: now })
      .where(eq(s.customers.id, customerId));
    await tx
      .insert(s.outbox)
      .values({
        eventType: 'customer.kyc_submitted',
        aggregate: 'customer',
        aggregateId: customerId,
        payload: { docType: fields.data.docType },
      });
  });
  return getKycState(db, customerId, now);
}

// ─── Équipe ──────────────────────────────────────────────────────────────────

const sign = (key: string, exp: number) =>
  createHmac('sha256', env().AUTH_SECRET).update(`kyc:${key}:${exp}`).digest('base64url');

/** Adresse signée d'une photo (valable quelques minutes), pour l'affichage dans le back-office. */
export function signedPhotoUrl(key: string, now = Date.now()): string {
  const exp = now + PHOTO_URL_TTL_MS;
  return `/v1/kyc-photo?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sign(key, exp)}`;
}

/** Photo demandée par une adresse signée encore valable, sinon null. */
export async function photoBySignature(key: string, exp: string, sig: string, now = Date.now()) {
  const expires = Number(exp);
  if (!key.startsWith('kyc/') || !Number.isFinite(expires) || expires < now) return null;
  const expected = Buffer.from(sign(key, expires));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return mediaStorage().get(key);
}

export async function adminKycOf(db: Db, customerId: string, now = new Date()): Promise<AdminKyc> {
  const [rules, status, spent30d, last] = await Promise.all([
    loadRules(db),
    statusOf(db, customerId),
    spentLast30Days(db, customerId, now),
    latest(db, customerId),
  ]);
  let reviewer: string | null = null;
  if (last?.reviewedBy) {
    const [a] = await db
      .select({ name: s.adminUsers.name })
      .from(s.adminUsers)
      .where(eq(s.adminUsers.id, last.reviewedBy));
    reviewer = a?.name ?? null;
  }
  const photos = (last?.photos ?? {}) as Partial<Record<KycPhoto, string>>;
  return {
    status,
    docType: (last?.docType as KycDocType | undefined) ?? null,
    docNumber: last?.docNumber ?? null,
    submittedAt: last?.createdAt.toISOString() ?? null,
    reviewedAt: last?.reviewedAt?.toISOString() ?? null,
    reviewedBy: reviewer,
    reason: last?.reason ?? null,
    photos: (['front', 'back', 'selfie'] as const)
      .filter((k) => photos[k])
      .map((kind) => ({ kind, url: signedPhotoUrl(photos[kind]!, now.getTime()) })),
    spent30d,
    threshold: rules.kycThreshold ?? 0,
  };
}

/** Valider ou refuser le dernier dossier envoyé (le client est prévenu). */
export async function reviewKyc(
  db: Db,
  ctx: AdminContext,
  customerId: string,
  body: AdminKycReviewBody,
  ip: string | null,
  now = new Date(),
) {
  const last = await latest(db, customerId);
  if (!last || last.status !== 'pending')
    throw invalid('Aucun dossier d’identité en attente pour ce client.');
  const approved = body.decision === 'approve';
  await db.transaction(async (txn) => {
    const tx = txn as unknown as Db;
    await tx
      .update(s.kycSubmissions)
      .set({
        status: approved ? 'verified' : 'rejected',
        reason: approved ? null : (body.reason ?? null),
        reviewedBy: ctx.admin.id,
        reviewedAt: now,
      })
      .where(eq(s.kycSubmissions.id, last.id));
    await tx
      .update(s.customers)
      .set({ kycStatus: approved ? 'verified' : 'rejected', updatedAt: now })
      .where(eq(s.customers.id, customerId));
    await notify(
      tx,
      customerId,
      approved
        ? {
            kind: 'profile',
            title: 'Identité vérifiée',
            body: 'Merci ! Vous pouvez commander sans plafond.',
            link: { type: 'account' },
          }
        : {
            kind: 'profile',
            title: 'Identité non validée',
            body: `Votre dossier n’a pas été accepté : ${body.reason}. Vous pouvez en envoyer un nouveau.`,
            link: { type: 'account' },
          },
      now,
    );
    await adminAudit(tx, {
      actorId: ctx.admin.id,
      action: approved ? 'customer.kyc_approved' : 'customer.kyc_rejected',
      entity: 'customer',
      entityId: customerId,
      ip,
      after: { submissionId: last.id, reason: body.reason ?? null },
    });
  });
}
