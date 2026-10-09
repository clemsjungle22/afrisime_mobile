import { AdminCarnetDetail, AdminCashBody } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { CASH_ROLES, recordCash } from '@/server/admin/packs';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Cotisation reçue en espèces au comptoir de l'agence. */
export const POST = adminRoute(
  { roles: CASH_ROLES, body: AdminCashBody, response: AdminCarnetDetail },
  (ctx) => recordCash(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
