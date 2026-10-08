import { AdminTeamCreate, AdminTeamCredentials, AdminTeamMember } from '@afrisime/shared';
import { z } from 'zod';
import { clientOf } from '@/server/admin/client';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES } from '@/server/admin/settings';
import { createMember, listTeam } from '@/server/admin/team';
import { getDb } from '@/server/db/client';

/** Comptes de l'équipe. */
export const GET = adminRoute(
  { roles: SETTINGS_ROLES, response: z.array(AdminTeamMember) },
  (ctx) => listTeam(getDb(), ctx),
);

/** Nouveau compte : mot de passe provisoire renvoyé une seule fois. */
export const POST = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminTeamCreate, response: AdminTeamCredentials, status: 201 },
  (ctx) => createMember(getDb(), ctx, ctx.body, clientOf(ctx.req).ip),
);
