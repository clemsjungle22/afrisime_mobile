import { eq } from 'drizzle-orm';
import { cancelByAdmin } from '@/server/admin/orders';
import type { Db } from '@/server/db/client';
import * as s from '@/server/db/schema';

/** Annulation par l'équipe (le client n'annule plus lui-même) : même chemin que le back-office. */
export async function cancelAsTeam(db: Db, orderId: string, now = new Date()) {
  const values = {
    id: 'adm_test_annulation',
    email: 'annulation@equipe.test',
    name: 'Équipe annulation',
    role: 'admin' as const,
    passwordHash: 'x',
    mustChangePassword: false,
  };
  await db.insert(s.adminUsers).values(values).onConflictDoNothing();
  const [admin] = await db.select().from(s.adminUsers).where(eq(s.adminUsers.id, values.id));
  const [order] = await db
    .select({ status: s.orders.status })
    .from(s.orders)
    .where(eq(s.orders.id, orderId));
  return cancelByAdmin(
    db,
    { admin: admin!, sessionId: 'ses_test' },
    orderId,
    { expectedStatus: order!.status, reason: 'Annulée pour l’essai' },
    '127.0.0.1',
    now,
  );
}
