import { Category } from '@afrisime/shared';
import { z } from 'zod';
import { listCategories } from '@/server/catalog/service';
import { PUBLIC_CACHE } from '@/server/http/params';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

export const GET = route({ response: z.array(Category), headers: PUBLIC_CACHE }, () => listCategories());
