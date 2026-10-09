'use server';

import {
  AdminCarnetDetail,
  type AdminCashBody,
  AdminPack,
  type AdminPackInput,
} from '@afrisime/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError, api } from '@/lib/api';

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Appel de l'API ; un refus devient un message affichable ; la page est rafraîchie après succès. */
async function run<T>(call: () => Promise<T>, paths: string[]): Promise<Result<T>> {
  try {
    const data = await call();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isUnauthenticated) redirect('/login?etape=expiree');
      const issue = (error.details as { issues?: { message: string }[] } | undefined)?.issues?.[0];
      return { ok: false, error: issue?.message ?? error.message };
    }
    return { ok: false, error: 'Une erreur est survenue. Réessayez.' };
  }
}

/** Crée ou modifie un pack ; renvoie son identifiant (pour y joindre une photo). */
export async function savePackAction(
  id: string | null,
  body: AdminPackInput,
): Promise<Result<{ id: string }>> {
  const res = await run(
    () =>
      api(id ? `/v1/admin/packs/${encodeURIComponent(id)}` : '/v1/admin/packs', {
        method: id ? 'PATCH' : 'POST',
        body,
        schema: z.array(AdminPack),
      }),
    ['/packs'],
  );
  if (!res.ok) return res;
  // Création : le nouveau pack est le dernier de la liste.
  return { ok: true, data: { id: id ?? res.data.at(-1)?.id ?? '' } };
}

/** Cotisation reçue en espèces au comptoir. */
export async function cashAction(carnetId: string, body: AdminCashBody): Promise<Result> {
  const res = await run(
    () =>
      api(`/v1/admin/carnets/${encodeURIComponent(carnetId)}/cash`, {
        method: 'POST',
        body,
        schema: AdminCarnetDetail,
      }),
    [`/packs/carnets/${carnetId}`, '/packs'],
  );
  return res.ok ? { ok: true, data: undefined } : res;
}
