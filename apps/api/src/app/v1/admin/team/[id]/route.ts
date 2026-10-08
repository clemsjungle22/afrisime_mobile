import { AdminTeamMember, AdminTeamUpdate } from '@afrisime/shared';
import { z } from 'zod';
import { clientOf } from '@/server/admin/client';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES } from '@/server/admin/settings';
import { updateMember } from '@/server/admin/team';
import { getDb } from '@/server/db/client';

/** Changer le rôle, désactiver ou réactiver (sessions du compte fermées). */
export const PATCH = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminTeamUpdate, response: z.array(AdminTeamMember) },
  (ctx) => updateMember(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
