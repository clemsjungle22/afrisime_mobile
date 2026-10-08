'use server';

import {
  AdminAgency,
  type AdminAgencyInput,
  type AdminCheckoutRules,
  AdminCustomerType,
  type AdminCustomerTypeInput,
  AdminDeliverySettings,
  AdminSlotSettings,
  AdminTeamCredentials,
  AdminTeamMember,
  type AdminTeamCreate,
  type AdminTeamUpdate,
  type AdminZoneInput,
  type SlotConfig,
} from '@afrisime/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError, api } from '@/lib/api';

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const enc = encodeURIComponent;

/** Appel de l'API ; un refus devient un message affichable ; la page est rafraîchie après succès. */
async function run<S extends z.ZodType>(
  path: string,
  method: 'POST' | 'PATCH' | 'PUT',
  schema: S,
  body?: unknown,
): Promise<Result<z.infer<S>>> {
  try {
    const data = await api(path, { method, body, schema });
    revalidatePath('/parametres');
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

const done = <T>(res: Result<T>): Result => (res.ok ? { ok: true, data: undefined } : res);
type Direction = 'up' | 'down';

// ─── Livraison ───────────────────────────────────────────────────────────────

export async function saveZoneAction(id: string | null, body: AdminZoneInput) {
  return done(
    await run(
      id ? `/v1/admin/settings/zones/${enc(id)}` : '/v1/admin/settings/zones',
      id ? 'PATCH' : 'POST',
      AdminDeliverySettings,
      body,
    ),
  );
}

export async function moveZoneAction(id: string, direction: Direction) {
  return done(
    await run(`/v1/admin/settings/zones/${enc(id)}/move`, 'POST', AdminDeliverySettings, {
      direction,
    }),
  );
}

export async function saveRulesAction(body: AdminCheckoutRules) {
  return done(await run('/v1/admin/settings/delivery/rules', 'PUT', AdminDeliverySettings, body));
}

// ─── Créneaux ────────────────────────────────────────────────────────────────

export async function saveSlotsAction(body: SlotConfig) {
  return done(await run('/v1/admin/settings/slots', 'PUT', AdminSlotSettings, body));
}

// ─── Agences ─────────────────────────────────────────────────────────────────

const Agencies = z.array(AdminAgency);

export async function saveAgencyAction(id: string | null, body: AdminAgencyInput) {
  return done(
    await run(
      id ? `/v1/admin/settings/agencies/${enc(id)}` : '/v1/admin/settings/agencies',
      id ? 'PATCH' : 'POST',
      Agencies,
      body,
    ),
  );
}

export async function defaultAgencyAction(id: string) {
  return done(await run(`/v1/admin/settings/agencies/${enc(id)}/default`, 'POST', Agencies));
}

export async function moveAgencyAction(id: string, direction: Direction) {
  return done(
    await run(`/v1/admin/settings/agencies/${enc(id)}/move`, 'POST', Agencies, { direction }),
  );
}

// ─── Profils clients ─────────────────────────────────────────────────────────

const Types = z.array(AdminCustomerType);

export async function saveTypeAction(id: string | null, body: AdminCustomerTypeInput) {
  return done(
    await run(
      id ? `/v1/admin/settings/customer-types/${enc(id)}` : '/v1/admin/settings/customer-types',
      id ? 'PATCH' : 'POST',
      Types,
      body,
    ),
  );
}

export async function moveTypeAction(id: string, direction: Direction) {
  return done(
    await run(`/v1/admin/settings/customer-types/${enc(id)}/move`, 'POST', Types, { direction }),
  );
}

// ─── Équipe ──────────────────────────────────────────────────────────────────

const Team = z.array(AdminTeamMember);

/** Renvoie le mot de passe provisoire, à montrer une seule fois. */
export async function createMemberAction(body: AdminTeamCreate) {
  return run('/v1/admin/team', 'POST', AdminTeamCredentials, body);
}

export async function updateMemberAction(id: string, body: AdminTeamUpdate) {
  return done(await run(`/v1/admin/team/${enc(id)}`, 'PATCH', Team, body));
}

export async function resetPasswordAction(id: string) {
  return run(`/v1/admin/team/${enc(id)}/reset-password`, 'POST', AdminTeamCredentials);
}

export async function resetTotpAction(id: string) {
  return done(await run(`/v1/admin/team/${enc(id)}/reset-totp`, 'POST', Team));
}

export async function unlockMemberAction(id: string) {
  return done(await run(`/v1/admin/team/${enc(id)}/unlock`, 'POST', Team));
}
