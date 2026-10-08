import { AdminCustomerDetail, AdminReviewProBody } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { CUSTOMER_REVIEW_ROLES, reviewPro } from '@/server/admin/customers';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Valider ou refuser (motif obligatoire) le profil pro déclaré par le client. */
export const POST = adminRoute(
  { roles: CUSTOMER_REVIEW_ROLES, body: AdminReviewProBody, response: AdminCustomerDetail },
  (ctx) => reviewPro(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
