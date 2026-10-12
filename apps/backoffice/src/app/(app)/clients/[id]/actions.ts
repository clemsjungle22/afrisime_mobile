'use server';

import {
  AdminCustomerDetail,
  type AdminKycReviewBody,
  type AdminPricingBody,
  type AdminReviewProBody,
} from '@afrisime/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

export type Result = { ok: true } | { ok: false; error: string };

/** Appel de l'API pour la fiche ; un refus devient un message affichable. */
async function run(id: string, path: string, body: object): Promise<Result> {
  try {
    await api(`/v1/admin/customers/${encodeURIComponent(id)}/${path}`, {
      method: 'POST',
      body,
      schema: AdminCustomerDetail,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isUnauthenticated) redirect('/login?etape=expiree');
      const issue = (error.details as { issues?: { message: string }[] } | undefined)?.issues?.[0];
      return { ok: false, error: issue?.message ?? error.message };
    }
    return { ok: false, error: 'Une erreur est survenue. Réessayez.' };
  }
  revalidatePath(`/clients/${id}`);
  revalidatePath('/clients');
  revalidatePath('/');
  return { ok: true };
}

export async function reviewProAction(id: string, body: AdminReviewProBody) {
  return run(id, 'review', body);
}

export async function kycAction(id: string, body: AdminKycReviewBody) {
  return run(id, 'kyc', body);
}

export async function pricingAction(id: string, body: AdminPricingBody) {
  return run(id, 'pricing', body);
}

export async function blockAction(id: string, blocked: boolean, reason: string) {
  return run(id, blocked ? 'block' : 'unblock', { reason });
}
