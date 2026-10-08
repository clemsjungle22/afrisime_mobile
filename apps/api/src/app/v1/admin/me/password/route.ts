import { AdminChangePasswordBody, AdminProfile } from '@afrisime/shared';
import { changePassword } from '@/server/admin/auth';
import { clientOf } from '@/server/admin/client';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Changement de mot de passe (obligatoire après un mot de passe provisoire) ; les autres sessions sont fermées. */
export const POST = adminRoute(
  { allowPendingPassword: true, body: AdminChangePasswordBody, response: AdminProfile },
  (ctx) => changePassword(getDb(), ctx, ctx.body, clientOf(ctx.req).ip),
);
