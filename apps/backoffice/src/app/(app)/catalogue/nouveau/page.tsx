import { AdminCategory, OnboardingOptions } from '@afrisime/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { api } from '@/lib/api';
import { CATALOG_EDIT_ROLES } from '@/lib/catalog';
import { ProductCreateForm } from '../product-forms';

export const metadata: Metadata = { title: 'Nouveau produit' };

export default async function NewProductPage() {
  await requireAdmin({ roles: CATALOG_EDIT_ROLES });
  const [categories, options] = await Promise.all([
    api('/v1/admin/catalog/categories', { schema: z.array(AdminCategory) }),
    api('/v1/onboarding/options', { schema: OnboardingOptions, auth: false }),
  ]);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/catalogue"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Catalogue
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Nouveau produit</h1>
      <ProductCreateForm
        categories={categories}
        agencies={options.agencies.map(({ id, name }) => ({ id, name }))}
      />
    </div>
  );
}
