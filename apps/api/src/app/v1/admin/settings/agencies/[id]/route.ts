import { AdminAgency, AdminAgencyInput } from '@afrisime/shared';
import { z } from 'zod';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, saveAgency } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

export const PATCH = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminAgencyInput, response: z.array(AdminAgency) },
  (ctx) => saveAgency(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
