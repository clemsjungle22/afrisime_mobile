import { Home } from '@afrisime/shared';
import { getHome, segmentOf } from '@/server/catalog/service';
import { PUBLIC_CACHE } from '@/server/http/params';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

export const GET = route(
  { auth: 'optional', response: Home, headers: PUBLIC_CACHE, privateWhenAuthenticated: true },
  ({ auth }) => getHome(segmentOf(auth)),
);
