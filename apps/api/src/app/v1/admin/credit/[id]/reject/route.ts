import { AdminCreditDetail, AdminCreditRejectBody } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { CREDIT_MANAGE_ROLES, rejectCreditRequest } from '@/server/admin/credit';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Refuser la demande de crédit en attente (motif affiché à la cliente). */
export const POST = adminRoute(
  { roles: CREDIT_MANAGE_ROLES, body: AdminCreditRejectBody, response: AdminCreditDetail },
  (ctx) => rejectCreditRequest(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
