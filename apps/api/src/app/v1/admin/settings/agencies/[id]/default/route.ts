import { AdminAgency } from '@afrisime/shared';
import { z } from 'zod';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, setDefaultAgency } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

/** Agence par défaut : celle des visiteurs et des nouveaux clients. */
export const POST = adminRoute({ roles: SETTINGS_ROLES, response: z.array(AdminAgency) }, (ctx) =>
  setDefaultAgency(getDb(), ctx, ctx.params.id ?? ''),
);
