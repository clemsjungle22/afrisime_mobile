'use server';

import { AdminOrderDetail, type AdminOrderAction, type OrderStatus } from '@afrisime/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

export type ActionState = { ok?: boolean; error?: string; field?: string };

const text = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? '').trim();
  return v === '' ? undefined : v;
};

/** Exécute une action sur la commande et renvoie un message lisible en cas de refus. */
async function run(orderId: string, call: () => Promise<unknown>): Promise<ActionState> {
  try {
    await call();
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isUnauthenticated) redirect('/login?etape=expiree');
      return {
        error: error.message,
        field: (error.details as { field?: string } | undefined)?.field,
      };
    }
    return { error: 'Une erreur est survenue. Réessayez.' };
  }
  revalidatePath(`/commandes/${orderId}`);
  revalidatePath('/commandes');
  return { ok: true };
}

/** Une seule action serveur pour toutes les actions de la fiche (le formulaire indique laquelle). */
export async function orderAction(
  orderId: string,
  action: Exclude<AdminOrderAction, 'add_note'>,
  expectedStatus: OrderStatus,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const path = `/v1/admin/orders/${encodeURIComponent(orderId)}`;
  if (action === 'collect_payment') {
    const amount = Number(String(fd.get('amount') ?? '').replace(/\s/g, ''));
    return run(orderId, () =>
      api(`${path}/collect`, {
        method: 'POST',
        body: { expectedStatus, amount },
        schema: AdminOrderDetail,
      }),
    );
  }
  if (action === 'cancel') {
    return run(orderId, () =>
      api(`${path}/cancel`, {
        method: 'POST',
        body: { expectedStatus, reason: text(fd, 'reason') ?? '' },
        schema: AdminOrderDetail,
      }),
    );
  }
  return run(orderId, () =>
    api(`${path}/transition`, {
      method: 'POST',
      body: {
        action,
        expectedStatus,
        note: text(fd, 'note'),
        pickupCode: text(fd, 'pickupCode')?.replace(/\s/g, ''),
      },
      schema: AdminOrderDetail,
    }),
  );
}

export async function noteAction(
  orderId: string,
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const body = { text: text(fd, 'text') ?? '' };
  if (!body.text) return { error: 'Écrivez une note.', field: 'text' };
  return run(orderId, () =>
    api(`/v1/admin/orders/${encodeURIComponent(orderId)}/notes`, {
      method: 'POST',
      body,
      schema: AdminOrderDetail,
    }),
  );
}
