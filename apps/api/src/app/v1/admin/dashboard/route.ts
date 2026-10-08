import { AdminDashboard } from '@afrisime/shared';
import { getDashboard } from '@/server/admin/dashboard';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Chiffres du jour et points d'attention (toute l'équipe). */
export const GET = adminRoute({ response: AdminDashboard }, () => getDashboard(getDb()));
