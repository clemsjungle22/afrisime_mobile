import { AdminStockMovement } from '@afrisime/shared';
import { z } from 'zod';
import { CATALOG_VIEW_ROLES, listMovements } from '@/server/admin/catalog';
import { getDb } from '@/server/db/client';
import { adminRoute } from '@/server/admin/route';

/** Historique des mouvements de stock d'un format (100 derniers). */
export const GET = adminRoute(
  { roles: CATALOG_VIEW_ROLES, response: z.array(AdminStockMovement) },
  ({ params }) => listMovements(getDb(), params.id ?? ''),
);
