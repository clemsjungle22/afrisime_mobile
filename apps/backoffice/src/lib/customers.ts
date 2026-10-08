import type { AdminRole } from '@afrisime/shared';

/** Données personnelles : pas le rôle Catalogue (même règle que l'API). */
export const CUSTOMER_VIEW_ROLES: readonly AdminRole[] = ['admin', 'support', 'orders', 'readonly'];
