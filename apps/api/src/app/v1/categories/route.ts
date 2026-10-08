import { Category } from '@afrisime/shared';
import { z } from 'zod';
import { listCategories, segmentOf } from '@/server/catalog/service';
import { PUBLIC_CACHE } from '@/server/http/params';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

export const GET = route(
  {
    auth: 'optional',
    response: z.array(Category),
    headers: PUBLIC_CACHE,
    privateWhenAuthenticated: true,
  },
  ({ auth }) => listCategories(segmentOf(auth)),
);
