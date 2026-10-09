import { AdminCreditDetail, AdminCreditGrantBody } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import {
  CREDIT_MANAGE_ROLES,
  CREDIT_VIEW_ROLES,
  getAdminCredit,
  grantCredit,
} from '@/server/admin/credit';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

export const GET = adminRoute(
  { roles: CREDIT_VIEW_ROLES, response: AdminCreditDetail },
  ({ params, admin }) => getAdminCredit(getDb(), admin.role, params.id ?? ''),
);

/** Accorder le crédit (accepte la demande en attente) ou modifier plafond et durée. */
export const PUT = adminRoute(
  { roles: CREDIT_MANAGE_ROLES, body: AdminCreditGrantBody, response: AdminCreditDetail },
  (ctx) => grantCredit(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
