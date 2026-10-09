import { Carnet } from '@afrisime/shared';
import { getCarnet } from '@/server/carnets/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Carnet : progression, retard, historique ; une cotisation en attente est revérifiée. */
export const GET = route({ auth: 'required', response: Carnet }, ({ auth, params }) =>
  getCarnet(getDb(), auth.customer, params.id ?? ''),
);
