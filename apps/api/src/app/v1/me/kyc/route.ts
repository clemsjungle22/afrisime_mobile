import { KycState } from '@afrisime/shared';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';
import { getKycState, submitKyc } from '@/server/kyc/service';

/** Vérification d'identité du client : état, seuil et achats des 30 derniers jours. */
export const GET = route({ auth: 'required', response: KycState }, ({ auth }) =>
  getKycState(getDb(), auth.customer.id),
);

/** Envoi du dossier (multipart : docType, docNumber, front, back sauf passeport, selfie). */
export const POST = route({ auth: 'required', response: KycState, status: 201 }, ({ auth, req }) =>
  submitKyc(getDb(), auth.customer.id, req),
);
