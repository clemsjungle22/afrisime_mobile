import { AdminDeliverySettings } from '@afrisime/shared';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, getDeliverySettings } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

/** Zones de livraison et règles du checkout. */
export const GET = adminRoute({ roles: SETTINGS_ROLES, response: AdminDeliverySettings }, () =>
  getDeliverySettings(getDb()),
);
