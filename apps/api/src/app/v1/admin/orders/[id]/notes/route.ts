import { AdminNoteBody, AdminOrderDetail } from '@afrisime/shared';
import { ORDER_NOTE_ROLES, addOrderNote } from '@/server/admin/orders';
import { adminRoute } from '@/server/admin/route';
import { getDb } from '@/server/db/client';

/** Note interne (jamais visible par le client). */
export const POST = adminRoute(
  { roles: ORDER_NOTE_ROLES, body: AdminNoteBody, response: AdminOrderDetail, status: 201 },
  (ctx) => addOrderNote(getDb(), ctx, ctx.params.id ?? '', ctx.body.text),
);
