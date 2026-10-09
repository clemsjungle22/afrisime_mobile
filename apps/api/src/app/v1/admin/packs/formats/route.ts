import { AdminPackFormat } from '@afrisime/shared';
import { z } from 'zod';
import { PACK_EDIT_ROLES, listPackFormats } from '@/server/admin/packs';
import { adminRoute } from '@/server/admin/route';

/** Formats du catalogue à composer dans un pack. */
export const GET = adminRoute({ roles: PACK_EDIT_ROLES, response: z.array(AdminPackFormat) }, () =>
  listPackFormats(),
);
