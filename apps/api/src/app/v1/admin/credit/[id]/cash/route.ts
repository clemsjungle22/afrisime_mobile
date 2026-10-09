import { AdminCreditCashBody, AdminCreditDetail } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { CREDIT_CASH_ROLES, recordCreditCash } from '@/server/admin/credit';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Remboursement reçu en espèces au comptoir de l'agence. */
export const POST = adminRoute(
  { roles: CREDIT_CASH_ROLES, body: AdminCreditCashBody, response: AdminCreditDetail },
  (ctx) => recordCreditCash(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
