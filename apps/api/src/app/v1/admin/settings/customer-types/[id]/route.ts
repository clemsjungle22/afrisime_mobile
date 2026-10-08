import { AdminCustomerType, AdminCustomerTypeInput } from '@afrisime/shared';
import { z } from 'zod';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, saveCustomerType } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

export const PATCH = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminCustomerTypeInput, response: z.array(AdminCustomerType) },
  (ctx) => saveCustomerType(getDb(), ctx, ctx.params.id ?? '', ctx.body),
);
