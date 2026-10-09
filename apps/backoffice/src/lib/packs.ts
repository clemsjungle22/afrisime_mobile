import type { AdminRole } from '@afrisime/shared';
import { CUSTOMER_VIEW_ROLES } from './customers';

/** Mêmes règles que l'API. */
export const PACK_VIEW_ROLES: readonly AdminRole[] = [
  'admin',
  'catalog',
  'orders',
  'support',
  'readonly',
];
export const PACK_EDIT_ROLES: readonly AdminRole[] = ['admin', 'catalog'];
/** Carnets : données personnelles des clients. */
export const CARNET_VIEW_ROLES = CUSTOMER_VIEW_ROLES;
