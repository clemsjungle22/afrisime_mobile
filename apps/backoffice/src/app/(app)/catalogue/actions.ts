'use server';

import {
  AdminCategory,
  type AdminCategoryInput,
  type AdminNewVariant,
  type AdminPriceBody,
  type AdminProductCreate,
  AdminProductDetail,
  type AdminProductInput,
  type AdminPromoBody,
  type AdminStockBody,
  AdminStockMovement,
  type AdminVariantInput,
} from '@afrisime/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError, api, apiUpload } from '@/lib/api';

export type Result<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; field?: string };

/** Appel de l'API depuis le serveur du back-office ; un refus devient un message affichable. */
async function attempt<T>(call: () => Promise<T>, paths: string[]): Promise<Result<T>> {
  try {
    const data = await call();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.isUnauthenticated) redirect('/login?etape=expiree');
      const details = error.details as
        { field?: string; issues?: { path: string; message: string }[] } | undefined;
      const issue = details?.issues?.[0];
      return {
        ok: false,
        error: issue ? issue.message : error.message,
        field: details?.field ?? issue?.path.split('.').pop(),
      };
    }
    return { ok: false, error: 'Une erreur est survenue. Réessayez.' };
  }
}

const enc = encodeURIComponent;
const productPaths = (id: string) => ['/catalogue', `/catalogue/${id}`];

export async function createProductAction(
  body: AdminProductCreate,
): Promise<Result<{ id: string }>> {
  const res = await attempt(
    () => api('/v1/admin/catalog/products', { method: 'POST', body, schema: AdminProductDetail }),
    ['/catalogue'],
  );
  return res.ok ? { ok: true, data: { id: res.data.id } } : res;
}

export async function updateProductAction(id: string, body: AdminProductInput): Promise<Result> {
  const res = await attempt(
    () =>
      api(`/v1/admin/catalog/products/${enc(id)}`, {
        method: 'PATCH',
        body,
        schema: AdminProductDetail,
      }),
    productPaths(id),
  );
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function addVariantAction(productId: string, body: AdminNewVariant): Promise<Result> {
  const res = await attempt(
    () =>
      api(`/v1/admin/catalog/products/${enc(productId)}/variants`, {
        method: 'POST',
        body,
        schema: AdminProductDetail,
      }),
    productPaths(productId),
  );
  return res.ok ? { ok: true, data: undefined } : res;
}

/** Opérations sur un format (modification, prix, promo, stock, seuil) : même forme de réponse. */
export async function variantAction(
  productId: string,
  variantId: string,
  op:
    | { kind: 'update'; body: AdminVariantInput }
    | { kind: 'price'; body: AdminPriceBody }
    | { kind: 'promo'; body: AdminPromoBody }
    | { kind: 'stock'; body: AdminStockBody }
    | { kind: 'threshold'; body: { agencyId: string; lowThreshold: number } }
    | { kind: 'end-price'; priceId: number },
): Promise<Result> {
  const base = `/v1/admin/catalog/variants/${enc(variantId)}`;
  const call = () => {
    switch (op.kind) {
      case 'update':
        return api(base, { method: 'PATCH', body: op.body, schema: AdminProductDetail });
      case 'price':
        return api(`${base}/prices`, { method: 'POST', body: op.body, schema: AdminProductDetail });
      case 'promo':
        return api(`${base}/promotions`, {
          method: 'POST',
          body: op.body,
          schema: AdminProductDetail,
        });
      case 'stock':
        return api(`${base}/stock`, { method: 'POST', body: op.body, schema: AdminProductDetail });
      case 'threshold':
        return api(`${base}/threshold`, {
          method: 'POST',
          body: op.body,
          schema: AdminProductDetail,
        });
      case 'end-price':
        return api(`/v1/admin/catalog/prices/${op.priceId}/end`, {
          method: 'POST',
          schema: AdminProductDetail,
        });
    }
  };
  const res = await attempt(call, productPaths(productId));
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function movementsAction(variantId: string): Promise<Result<AdminStockMovement[]>> {
  return attempt(
    () =>
      api(`/v1/admin/catalog/variants/${enc(variantId)}/movements`, {
        schema: z.array(AdminStockMovement),
      }),
    [],
  );
}

const Categories = z.array(AdminCategory);

export async function saveCategoryAction(
  id: string | null,
  body: AdminCategoryInput,
): Promise<Result> {
  const res = await attempt(
    () =>
      id
        ? api(`/v1/admin/catalog/categories/${enc(id)}`, {
            method: 'PATCH',
            body,
            schema: Categories,
          })
        : api('/v1/admin/catalog/categories', { method: 'POST', body, schema: Categories }),
    ['/catalogue/rayons', '/catalogue'],
  );
  return res.ok ? { ok: true, data: undefined } : res;
}

export async function moveCategoryAction(id: string, direction: 'up' | 'down'): Promise<Result> {
  const res = await attempt(
    () =>
      api(`/v1/admin/catalog/categories/${enc(id)}/move`, {
        method: 'POST',
        body: { direction },
        schema: Categories,
      }),
    ['/catalogue/rayons'],
  );
  return res.ok ? { ok: true, data: undefined } : res;
}

/** Photo d'un produit ou d'un rayon : envoi (formulaire avec « file ») ou retrait (form = null). */
export async function imageAction(
  target: { kind: 'product'; id: string } | { kind: 'category'; id: string },
  form: FormData | null,
): Promise<Result> {
  const path =
    target.kind === 'product'
      ? `/v1/admin/catalog/products/${enc(target.id)}/image`
      : `/v1/admin/catalog/categories/${enc(target.id)}/image`;
  const schema = target.kind === 'product' ? AdminProductDetail : Categories;
  const paths =
    target.kind === 'product' ? productPaths(target.id) : ['/catalogue/rayons', '/catalogue'];
  const res = await attempt<unknown>(
    () => (form ? apiUpload(path, form, schema) : api(path, { method: 'DELETE', schema })),
    paths,
  );
  return res.ok ? { ok: true, data: undefined } : res;
}
