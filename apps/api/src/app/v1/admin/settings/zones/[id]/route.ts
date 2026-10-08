import { AdminDeliverySettings, AdminZoneInput } from '@afrisime/shared';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, saveZone } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

/** Modifier une zone (désactivée : plus de livraison dans ses quartiers). */
export const PATCH = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminZoneInput, response: AdminDeliverySettings },
  (ctx) => saveZone(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
