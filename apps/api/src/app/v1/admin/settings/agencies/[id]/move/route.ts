import { AdminAgency, AdminMoveBody } from '@afrisime/shared';
import { z } from 'zod';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, moveAgency } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

export const POST = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminMoveBody, response: z.array(AdminAgency) },
  (ctx) => moveAgency(getDb(), ctx, ctx.params.id ?? '', ctx.body.direction),
);
