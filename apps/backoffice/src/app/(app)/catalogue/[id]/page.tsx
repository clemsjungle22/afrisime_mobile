import { AdminCategory, AdminProductDetail, OnboardingOptions } from '@afrisime/shared';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { ApiError, api } from '@/lib/api';
import { CATALOG_EDIT_ROLES, CATALOG_VIEW_ROLES, initials } from '@/lib/catalog';
import { formatDateTime } from '@/lib/utils';
import { ProductEditForm } from '../product-forms';
import { AddVariantButton, VariantCard } from './variant-card';

export const metadata: Metadata = { title: 'Produit' };

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin({ roles: CATALOG_VIEW_ROLES });
  const canEdit = CATALOG_EDIT_ROLES.includes(admin.role);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  let product: AdminProductDetail;
  try {
    product = await api(`/v1/admin/catalog/products/${encodeURIComponent(id)}`, {
      schema: AdminProductDetail,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const [categories, options] = await Promise.all([
    api('/v1/admin/catalog/categories', { schema: z.array(AdminCategory) }),
    api('/v1/onboarding/options', { schema: OnboardingOptions, auth: false }),
  ]);
  const agencies = options.agencies.map(({ id: agencyId, name }) => ({ id: agencyId, name }));
  const category = categories.find((c) => c.id === product.categoryId);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/catalogue"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Catalogue
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <span
          className="grid size-14 place-items-center rounded-2xl text-xl font-extrabold text-white"
          style={{
            background: `linear-gradient(135deg, ${category?.color ?? '#0f3d2e'}, ${category?.color ?? '#0f3d2e'}cc)`,
          }}
          aria-hidden
        >
          {initials(product.name)}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">{product.name}</h1>
            <Badge tone={product.isActive ? 'success' : 'danger'}>
              {product.isActive ? 'Actif' : 'Désactivé'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {product.brand} · {category?.name} · modifié le {formatDateTime(product.updatedAt)}
          </p>
        </div>
      </div>

      {query.cree ? (
        <Alert tone="success">Produit créé. Il est visible dans l’app en moins d’une minute.</Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.6fr]">
        <Card className="h-fit">
          <CardHeader
            title="Informations"
            description={
              canEdit
                ? undefined
                : 'Consultation seule (votre rôle ne permet pas de modifier le catalogue).'
            }
          />
          <div className="p-5">
            <ProductEditForm product={product} categories={categories} disabled={!canEdit} />
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-ink">
              Formats <span className="font-semibold text-muted">({product.variants.length})</span>
            </h2>
            {canEdit ? <AddVariantButton productId={product.id} agencies={agencies} /> : null}
          </div>
          {product.variants.map((v) => (
            <VariantCard
              key={v.id}
              productId={product.id}
              variant={v}
              agencies={agencies}
              canEdit={canEdit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
