import { AdminDeliverySettings, AdminZoneInput } from '@afrisime/shared';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, saveZone } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

/** Nouvelle zone de livraison (quartiers couverts, frais). */
export const POST = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminZoneInput, response: AdminDeliverySettings, status: 201 },
  (ctx) => saveZone(getDb(), ctx, null, ctx.body),
);
