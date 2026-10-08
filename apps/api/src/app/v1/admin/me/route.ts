import { AdminProfile } from '@afrisime/shared';
import { toAdminProfile } from '@/server/admin/auth';
import { adminRoute } from '@/server/admin/route';

export const GET = adminRoute({ allowPendingPassword: true, response: AdminProfile }, ({ admin }) =>
  toAdminProfile(admin),
);
