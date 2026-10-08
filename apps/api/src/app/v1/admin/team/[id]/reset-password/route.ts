import { AdminTeamCredentials } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES } from '@/server/admin/settings';
import { resetPassword } from '@/server/admin/team';
import { getDb } from '@/server/db/client';

/** Nouveau mot de passe provisoire (renvoyé une seule fois). */
export const POST = adminRoute({ roles: SETTINGS_ROLES, response: AdminTeamCredentials }, (ctx) =>
  resetPassword(getDb(), ctx, ctx.params.id ?? '', clientOf(ctx.req).ip),
);
