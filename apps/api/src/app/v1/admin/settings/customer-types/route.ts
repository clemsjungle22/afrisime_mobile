import { AdminCustomerType, AdminCustomerTypeInput } from '@afrisime/shared';
import { z } from 'zod';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, listCustomerTypes, saveCustomerType } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

export const GET = adminRoute({ roles: SETTINGS_ROLES, response: z.array(AdminCustomerType) }, () =>
  listCustomerTypes(getDb()),
);

/** Nouveau profil proposé à l'inscription. */
export const POST = adminRoute(
  {
    roles: SETTINGS_ROLES,
    body: AdminCustomerTypeInput,
    response: z.array(AdminCustomerType),
    status: 201,
  },
  (ctx) => saveCustomerType(getDb(), ctx, null, ctx.body),
);
