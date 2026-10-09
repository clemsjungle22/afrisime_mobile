import { PackList } from '@afrisime/shared';
import { listPacks } from '@/server/carnets/service';
import { getDb } from '@/server/db/client';
import { PUBLIC_CACHE } from '@/server/http/params';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** Packs Famille proposés (visibles sans compte). */
export const GET = route({ auth: 'none', response: PackList, headers: PUBLIC_CACHE }, () =>
  listPacks(getDb()),
);
