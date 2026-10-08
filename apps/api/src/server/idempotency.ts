import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db } from './db/client';
import * as s from './db/schema';
import { ApiError } from './http/errors';

const KEY = /^[\w-]{8,128}$/;

/** Clé anti-doublon envoyée par l'app (en-tête Idempotency-Key), obligatoire sur les créations et paiements. */
export function idempotencyKey(req: Request): string {
  const key = req.headers.get('idempotency-key');
  if (!key || !KEY.test(key)) throw new ApiError('VALIDATION_ERROR', 'En-tête Idempotency-Key requis.');
  return key;
}

const hashOf = (body: unknown) => createHash('sha256').update(JSON.stringify(body)).digest('base64url');

/**
 * Exécute `create` une seule fois par (client, clé) : rejouer la même requête renvoie la même ressource
 * (via `load`), la même clé avec un autre contenu → 409 IDEMPOTENCY_CONFLICT.
 * `create` reçoit la transaction et renvoie l'identifiant de la ressource créée.
 */
export async function once<T>(
  db: Db,
  scope: { customerId: string; key: string; route: string; body: unknown },
  create: (tx: Db) => Promise<string>,
  load: (id: string) => Promise<T>,
): Promise<T> {
  const requestHash = hashOf({ route: scope.route, body: scope.body });
  const where = and(eq(s.idempotencyKeys.customerId, scope.customerId), eq(s.idempotencyKeys.key, scope.key));

  const existing = async () => {
    const [row] = await db.select().from(s.idempotencyKeys).where(where);
    if (!row) return null;
    if (row.route !== scope.route || row.requestHash !== requestHash) {
      throw new ApiError('IDEMPOTENCY_CONFLICT', 'Requête déjà traitée avec un contenu différent.');
    }
    return (row.responseBody as { id: string }).id;
  };

  const done = await existing();
  if (done) return load(done);

  let id: string;
  try {
    id = await db.transaction(async (txn) => {
      const tx = txn as unknown as Db;
      // La clé est posée dans la même transaction : deux envois simultanés ne créent qu'une ressource.
      await tx.insert(s.idempotencyKeys).values({
        key: scope.key,
        customerId: scope.customerId,
        route: scope.route,
        requestHash,
      });
      const created = await create(tx);
      await tx
        .update(s.idempotencyKeys)
        .set({ responseStatus: 201, responseBody: { id: created } })
        .where(where);
      return created;
    });
  } catch (error) {
    // Course perdue contre un envoi simultané avec la même clé : on renvoie la ressource de l'autre.
    const winner = await existing().catch(() => null);
    if (winner) return load(winner);
    throw error;
  }
  return load(id);
}
