import { AdminTeamMember } from '@afrisime/shared';
import { z } from 'zod';
import { clientOf } from '@/server/admin/client';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES } from '@/server/admin/settings';
import { resetTotp } from '@/server/admin/team';
import { getDb } from '@/server/db/client';

/** Double authentification à reconfigurer à la prochaine connexion. */
export const POST = adminRoute(
  { roles: SETTINGS_ROLES, response: z.array(AdminTeamMember) },
  (ctx) => resetTotp(getDb(), ctx, ctx.params.id ?? '', clientOf(ctx.req).ip),
);
