import { DELIVERY_RULES } from '@afrisime/fixtures';
import { KYC_WINDOW_DAYS, KycState, type KycStatus, kycBlocks } from '@afrisime/shared';
import type { KycApi } from '@/features/kyc/api';
import { withAuth, withRetry } from '../client';
import { requireUser } from './authServer';
import { type MockDb, loadDb, saveDb } from './db';
import { mockError, simulate } from './simulate';

/**
 * Vérification d'identité du mode démo : mêmes règles que le serveur. Sans équipe pour vérifier,
 * un dossier envoyé est validé automatiquement au bout de quelques secondes (pour pouvoir essayer).
 */

const DAY_MS = 86_400_000;
const DEMO_REVIEW_MS = 8_000;
const NOT_COUNTED = new Set(['cancelled', 'refunded', 'payment_failed']);

export function mockSpent30d(db: MockDb, userId: string, now = Date.now()): number {
  return (db.orders[userId] ?? [])
    .filter((o) => !NOT_COUNTED.has(o.status) && Date.parse(o.createdAt) >= now - KYC_WINDOW_DAYS * DAY_MS)
    .reduce((n, o) => n + o.total, 0);
}

export function mockKycStatus(db: MockDb, userId: string, now = Date.now()): KycStatus {
  const k = db.kyc?.[userId];
  if (!k) return 'none';
  // Démo : validé automatiquement après quelques secondes.
  if (k.status === 'pending' && now - Date.parse(k.submittedAt) >= DEMO_REVIEW_MS) k.status = 'verified';
  return k.status;
}

/** Même refus que le serveur : achats au-delà du seuil sans identité vérifiée. */
export function assertMockKycAllows(db: MockDb, userId: string, orderTotal: number, now = Date.now()) {
  const threshold = DELIVERY_RULES.kycThreshold;
  const status = mockKycStatus(db, userId, now);
  const spent30d = mockSpent30d(db, userId, now);
  if (!kycBlocks({ threshold, spent30d, orderTotal, status })) return;
  throw mockError(
    'KYC_REQUIRED',
    status === 'pending'
      ? 'Vos achats dépassent le plafond autorisé sans vérification : votre identité est en cours de vérification, réessayez dès qu’elle est validée.'
      : 'Vos achats dépassent le plafond autorisé sans vérification : vérifiez votre identité (pièce et selfie) pour continuer.',
    403,
    { threshold, spent30d, status },
  );
}

function view(db: MockDb, userId: string, now = Date.now()): KycState {
  const status = mockKycStatus(db, userId, now);
  const k = db.kyc?.[userId];
  const threshold = DELIVERY_RULES.kycThreshold;
  const spent30d = mockSpent30d(db, userId, now);
  return {
    status,
    threshold,
    spent30d,
    remainingBeforeKyc: threshold > 0 && status !== 'verified' ? Math.max(0, threshold - spent30d) : null,
    docType: k?.docType ?? null,
    submittedAt: k?.submittedAt ?? null,
    reason: null,
  };
}

export const mockKycApi: KycApi = {
  get(signal) {
    return withRetry(
      () => withAuth((token) => simulate(KycState, async () => view(await loadDb(), (await requireUser(token)).id))),
      { canRetry: true, signal },
    );
  },
  submit(input) {
    return withRetry(
      () =>
        withAuth((token) =>
          simulate(KycState, async () => {
            const user = await requireUser(token);
            const db = await loadDb();
            const status = mockKycStatus(db, user.id);
            if (status === 'verified') throw mockError('VALIDATION_ERROR', 'Votre identité est déjà vérifiée.', 422);
            if (status === 'pending') throw mockError('VALIDATION_ERROR', 'Votre dossier est déjà en cours de vérification.', 422);
            if (!input.photos.front || !input.photos.selfie || (input.docType !== 'passport' && !input.photos.back)) {
              throw mockError('VALIDATION_ERROR', 'Ajoutez toutes les photos demandées.', 422);
            }
            const now = Date.now();
            await saveDb({ ...db, kyc: { ...db.kyc, [user.id]: { status: 'pending', docType: input.docType, submittedAt: new Date(now).toISOString() } } });
            return view(await loadDb(), user.id, now);
          }),
        ),
      { canRetry: false },
    );
  },
};
