'use server';

import { AdminHome, type AdminBannerInput, type AdminHomeSettingsBody } from '@afrisime/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const enc = encodeURIComponent;

/** Appel de l'API ; un refus devient un message affichable. La page est rafraîchie après succès. */
async function attempt(call: () => Promise<AdminHome>): Promise<Result<AdminHome>> {
  try {
    const data = await call();
    revalidatePath('/accueil-app');
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

/** Crée ou modifie une carte ; renvoie son identifiant (pour y joindre une photo). */
export async function saveBannerAction(
  id: string | null,
  body: AdminBannerInput,
): Promise<Result<{ id: string }>> {
  const res = await attempt(() =>
    id
      ? api(`/v1/admin/home/banners/${enc(id)}`, { method: 'PATCH', body, schema: AdminHome })
      : api('/v1/admin/home/banners', { method: 'POST', body, schema: AdminHome }),
  );
  if (!res.ok) return res;
  // Création : la nouvelle carte est la dernière de l'ordre de défilement.
  return { ok: true, data: { id: id ?? res.data.banners.at(-1)?.id ?? '' } };
}

export async function deleteBannerAction(id: string): Promise<Result> {
  const res = await attempt(() =>
    api(`/v1/admin/home/banners/${enc(id)}`, { method: 'DELETE', schema: AdminHome }),
  );
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function moveBannerAction(id: string, direction: 'up' | 'down'): Promise<Result> {
  const res = await attempt(() =>
    api(`/v1/admin/home/banners/${enc(id)}/move`, {
      method: 'POST',
      body: { direction },
      schema: AdminHome,
    }),
  );
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function saveSettingsAction(body: AdminHomeSettingsBody): Promise<Result> {
  const res = await attempt(() =>
    api('/v1/admin/home/settings', { method: 'PUT', body, schema: AdminHome }),
  );
  return res.ok ? { ok: true, data: undefined } : res;
}
