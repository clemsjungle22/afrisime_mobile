'use server';

import {
  type AdminCreditCashBody,
  AdminCreditDetail,
  type AdminCreditGrantBody,
  type AdminCreditRejectBody,
  type AdminCreditSuspendBody,
} from '@afrisime/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

export type Result = { ok: true } | { ok: false; error: string };

/** Action sur le crédit d'une cliente ; un refus devient un message affichable. */
async function run(
  customerId: string,
  path: string,
  method: 'PUT' | 'POST',
  body: unknown,
): Promise<Result> {
  try {
    await api(`/v1/admin/credit/${encodeURIComponent(customerId)}${path}`, {
      method,
      body,
      schema: AdminCreditDetail,
    });
    revalidatePath(`/credit/${customerId}`);
    revalidatePath('/credit');
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isUnauthenticated) redirect('/login?etape=expiree');
      const issue = (error.details as { issues?: { message: string }[] } | undefined)?.issues?.[0];
      return { ok: false, error: issue?.message ?? error.message };
    }
    return { ok: false, error: 'Une erreur est survenue. Réessayez.' };
  }
}

export const grantAction = async (customerId: string, body: AdminCreditGrantBody) =>
  run(customerId, '', 'PUT', body);
export const rejectAction = async (customerId: string, body: AdminCreditRejectBody) =>
  run(customerId, '/reject', 'POST', body);
export const suspendAction = async (customerId: string, body: AdminCreditSuspendBody) =>
  run(customerId, '/suspend', 'POST', body);
export const creditCashAction = async (customerId: string, body: AdminCreditCashBody) =>
  run(customerId, '/cash', 'POST', body);
