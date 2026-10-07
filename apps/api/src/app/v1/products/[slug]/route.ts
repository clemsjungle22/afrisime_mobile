import { ProductDetail } from '@afrisime/shared';
import { getProduct } from '@/server/catalog/service';
import { PUBLIC_CACHE } from '@/server/http/params';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

export const GET = route({ response: ProductDetail, headers: PUBLIC_CACHE }, ({ params }) => getProduct(params.slug ?? ''));
