import { Carnet } from '@afrisime/shared';
import { abandonCarnet } from '@/server/carnets/service';
import { getDb } from '@/server/db/client';
import { route } from '@/server/http/route';

/** Abandonner un carnet en cours : les sommes versées deviennent un avoir. */
export const POST = route({ auth: 'required', response: Carnet }, ({ auth, params }) =>
  abandonCarnet(getDb(), auth.customer, params.id ?? ''),
);
