import { AdminCustomerDetail, AdminKycReviewBody } from '@afrisime/shared';
import { clientOf } from '@/server/admin/client';
import { CUSTOMER_REVIEW_ROLES, getAdminCustomer } from '@/server/admin/customers';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';
import { reviewKyc } from '@/server/kyc/service';

/** Valider ou refuser le dossier d'identité en attente (le client est prévenu). */
export const POST = adminRoute(
  { roles: CUSTOMER_REVIEW_ROLES, body: AdminKycReviewBody, response: AdminCustomerDetail },
  async (ctx) => {
    const id = ctx.params.id ?? '';
    await reviewKyc(getDb(), ctx, id, ctx.body, clientOf(ctx.req).ip);
    return getAdminCustomer(getDb(), ctx.admin.role, id);
  },
);
