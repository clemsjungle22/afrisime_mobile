import { AdminCategory } from '@afrisime/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { api, mediaSrc } from '@/lib/api';
import { CATALOG_EDIT_ROLES, CATALOG_VIEW_ROLES } from '@/lib/catalog';
import { CategoriesManager } from './categories-manager';

export const metadata: Metadata = { title: 'Rayons' };

export default async function CategoriesPage() {
  const admin = await requireAdmin({ roles: CATALOG_VIEW_ROLES });
  const categories = await api('/v1/admin/catalog/categories', { schema: z.array(AdminCategory) });
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/catalogue"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Catalogue
      </Link>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Rayons</h1>
        <p className="mt-1 text-sm text-muted">Dans l’ordre d’affichage de l’app.</p>
      </div>
      <CategoriesManager
        categories={categories}
        srcs={Object.fromEntries(categories.map((c) => [c.id, mediaSrc(c.imageUrl)]))}
        canEdit={CATALOG_EDIT_ROLES.includes(admin.role)}
      />
    </div>
  );
}
