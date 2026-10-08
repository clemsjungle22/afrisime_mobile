import { AdminDeliverySettings, AdminMoveBody } from '@afrisime/shared';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, moveZone } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

export const POST = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminMoveBody, response: AdminDeliverySettings },
  (ctx) => moveZone(getDb(), ctx, ctx.params.id ?? '', ctx.body.direction),
);
