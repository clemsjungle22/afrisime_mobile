import type { AdminRole } from '@afrisime/shared';
import { CUSTOMER_VIEW_ROLES } from './customers';

/** Mêmes règles que l'API. */
export const CREDIT_VIEW_ROLES = CUSTOMER_VIEW_ROLES;
/** Accorder, modifier, suspendre, refuser : administrateur seulement. */
export const CREDIT_MANAGE_ROLES: readonly AdminRole[] = ['admin'];
