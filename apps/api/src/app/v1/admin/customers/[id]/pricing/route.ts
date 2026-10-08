import { AdminCustomerDetail, AdminPricingBody } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { CUSTOMER_REVIEW_ROLES, changePricing } from '@/server/admin/customers';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Changer le profil et le tarif d'un client (motif obligatoire). */
export const POST = adminRoute(
  { roles: CUSTOMER_REVIEW_ROLES, body: AdminPricingBody, response: AdminCustomerDetail },
  (ctx) => changePricing(getDb(), ctx, ctx.params.id ?? '', ctx.body, clientOf(ctx.req).ip),
);
