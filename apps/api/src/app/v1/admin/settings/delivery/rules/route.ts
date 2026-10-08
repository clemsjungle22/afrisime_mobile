import { AdminCheckoutRules, AdminDeliverySettings } from '@afrisime/shared';
import { adminRoute } from '@/server/admin/route';
import { SETTINGS_ROLES, saveCheckoutRules } from '@/server/admin/settings';
import { getDb } from '@/server/db/client';

/** Livraison offerte, minimum de commande, plafond du paiement à la livraison, délai minimum. */
export const PUT = adminRoute(
  { roles: SETTINGS_ROLES, body: AdminCheckoutRules, response: AdminDeliverySettings },
  (ctx) => saveCheckoutRules(getDb(), ctx, ctx.body),
);
