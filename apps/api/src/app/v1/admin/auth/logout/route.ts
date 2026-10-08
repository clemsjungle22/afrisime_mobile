import { z } from 'zod';
import { logout } from '@/server/admin/auth';
import { clientOf } from '@/server/admin/client';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

export const POST = adminRoute(
  { allowPendingPassword: true, response: z.null(), status: 204 },
  async (ctx) => {
    await logout(getDb(), ctx, clientOf(ctx.req).ip);
    return null;
  },
);
