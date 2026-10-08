import { AdminAgency, AdminAgencyInput } from '@afrisime/shared';
import { z } from 'zod';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, listAgencies, saveAgency } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

export const GET = adminRoute({ roles: SETTINGS_ROLES, response: z.array(AdminAgency) }, () =>
  listAgencies(getDb()),
);

/** Nouvelle agence (sans stock : à remplir depuis le catalogue). */
export const POST = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminAgencyInput, response: z.array(AdminAgency), status: 201 },
  (ctx) => saveAgency(getDb(), ctx, null, ctx.body),
);
