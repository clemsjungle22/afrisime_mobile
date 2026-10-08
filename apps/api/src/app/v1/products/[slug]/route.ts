import { ProductDetail } from '@afrisime/shared';
import { getProduct, segmentOf } from '@/server/catalog/service';
import { PUBLIC_CACHE } from '@/server/http/params';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

export const GET = route(
  {
    auth: 'optional',
    response: ProductDetail,
    headers: PUBLIC_CACHE,
    privateWhenAuthenticated: true,
  },
  ({ params, auth }) => getProduct(params.slug ?? '', segmentOf(auth)),
);
