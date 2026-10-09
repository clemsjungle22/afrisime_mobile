import { AdminCarnetDetail } from '@afrisime/shared';
import { CARNET_VIEW_ROLES, getAdminCarnet } from '@/server/admin/packs';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

export const GET = adminRoute(
  { roles: CARNET_VIEW_ROLES, response: AdminCarnetDetail },
  ({ params, admin }) => getAdminCarnet(getDb(), admin.role, params.id ?? ''),
);
