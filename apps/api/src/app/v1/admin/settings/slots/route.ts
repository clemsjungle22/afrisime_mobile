import { AdminSlotSettings } from '@afrisime/shared';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, getSlotSettings, saveSlotSettings } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

/** Plages horaires de livraison et de retrait, jours fermés, nombre de jours, capacité. */
export const GET = adminRoute({ roles: SETTINGS_ROLES, response: AdminSlotSettings }, () =>
  getSlotSettings(getDb()),
);

export const PUT = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminSlotSettings, response: AdminSlotSettings },
  (ctx) => saveSlotSettings(getDb(), ctx, ctx.body),
);
