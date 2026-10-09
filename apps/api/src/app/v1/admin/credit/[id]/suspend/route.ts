import { AdminCreditDetail, AdminCreditSuspendBody } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { CREDIT_MANAGE_ROLES, suspendCredit } from '@/server/admin/credit';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Suspendre ou rétablir le crédit. */
export const POST = adminRoute(
  { roles: CREDIT_MANAGE_ROLES, body: AdminCreditSuspendBody, response: AdminCreditDetail },
  (ctx) => suspendCredit(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
