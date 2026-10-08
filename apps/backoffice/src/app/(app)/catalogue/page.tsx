import {
  AdminCategory,
  AdminProductList,
  AdminProductListQuery,
  EDITORIAL_BADGE_LABELS,
} from '@afrisime/shared';
import { ChevronRight, LayoutGrid, Plus, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { Badge, Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { api } from '@/lib/api';
import { CATALOG_EDIT_ROLES, CATALOG_VIEW_ROLES, initials } from '@/lib/catalog';
import { cn, formatFCFA } from '@/lib/utils';

export const metadata: Metadata = { title: 'Catalogue' };

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin({ roles: CATALOG_VIEW_ROLES });
  const canEdit = CATALOG_EDIT_ROLES.includes(admin.role);
  const raw = await searchParams;
  const parsed = AdminProductListQuery.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => v)),
  );
  const query = parsed.success ? parsed.data : AdminProductListQuery.parse({});
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== '') params.set(k, String(v));

  const [data, categories] = await Promise.all([
    api(`/v1/admin/catalog/products?${params}`, { schema: AdminProductList }),
    api('/v1/admin/catalog/categories', { schema: z.array(AdminCategory) }),
  ]);
  const filtered = Boolean(query.q || query.categoryId || query.status !== 'all' || query.lowStock);
  const next = new URLSearchParams(params);
  if (data.nextCursor) next.set('cursor', data.nextCursor);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Catalogue</h1>
          <p className="mt-1 text-sm text-muted">
            {data.total} produit{data.total > 1 ? 's' : ''}. Les modifications sont visibles dans
            l’app en moins d’une minute.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/catalogue/rayons"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-brand-50"
          >
            <LayoutGrid className="size-4" aria-hidden /> Rayons
          </Link>
          {canEdit ? (
            <Link
              href="/catalogue/nouveau"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              <Plus className="size-4" aria-hidden /> Nouveau produit
            </Link>
          ) : null}
        </div>
      </div>

      <form
        method="get"
        action="/catalogue"
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto_auto]"
      >
        <label className="relative sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Rechercher</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Nom ou marque"
            className="h-10 w-full rounded-xl border border-line pr-3 pl-9 text-sm focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
          />
        </label>
        <select
          name="categoryId"
          defaultValue={query.categoryId ?? ''}
          aria-label="Rayon"
          className="h-10 rounded-xl border border-line bg-white px-3 text-sm"
        >
          <option value="">Rayon : tous</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={query.status}
          aria-label="Statut"
          className="h-10 rounded-xl border border-line bg-white px-3 text-sm"
        >
          <option value="all">Statut : tous</option>
          <option value="active">Actifs</option>
          <option value="inactive">Désactivés</option>
        </select>
        <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm">
          <input
            type="checkbox"
            name="lowStock"
            value="1"
            defaultChecked={Boolean(query.lowStock)}
            className="size-4 accent-brand-700"
          />
          Stock bas
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-10 cursor-pointer rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Filtrer
          </button>
          {filtered ? (
            <Link
              href="/catalogue"
              className="grid h-10 place-items-center rounded-xl px-3 text-sm font-semibold text-muted hover:bg-brand-50"
            >
              Effacer
            </Link>
          ) : null}
        </div>
      </form>

      <Card className="overflow-hidden">
        {data.items.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-muted">Aucun produit ne correspond.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-canvas">
                <tr className="text-left text-xs font-semibold tracking-wide text-muted uppercase">
                  <th scope="col" className="px-5 py-3">
                    Produit
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Rayon
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Prix public
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Stock vendable
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Statut
                  </th>
                  <th scope="col" className="px-2 py-3">
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((p) => (
                  <tr key={p.id} className="relative hover:bg-brand-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white"
                          style={{
                            background: `linear-gradient(135deg, ${p.category.color}, ${p.category.color}cc)`,
                          }}
                          aria-hidden
                        >
                          {initials(p.name)}
                        </span>
                        <div>
                          <Link
                            href={`/catalogue/${p.id}`}
                            className="font-bold text-ink after:absolute after:inset-0"
                          >
                            {p.name}
                          </Link>
                          <p className="text-xs text-muted">
                            {p.brand} · {p.variantsCount} format{p.variantsCount > 1 ? 's' : ''}
                            {p.badges.map((b) => ` · ${EDITORIAL_BADGE_LABELS[b]}`).join('')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted">{p.category.name}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {p.priceFrom === null ? (
                        <span className="text-muted">Sur devis</span>
                      ) : (
                        <span className="font-semibold text-ink">
                          {p.priceFrom === p.priceTo
                            ? formatFCFA(p.priceFrom)
                            : `${formatFCFA(p.priceFrom)} – ${formatFCFA(p.priceTo ?? p.priceFrom)}`}
                        </span>
                      )}
                      {p.onPromotion ? (
                        <Badge tone="accent" className="ml-2">
                          Promo
                        </Badge>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        'px-5 py-3 text-right font-semibold tabular-nums',
                        p.lowStock ? 'text-danger' : 'text-ink',
                      )}
                    >
                      {p.tracksStock ? (
                        p.sellable
                      ) : (
                        <span
                          className="font-normal text-muted"
                          title="Sur commande ou sur devis : pas de stock suivi"
                        >
                          —
                        </span>
                      )}
                      {p.lowStock ? (
                        <span className="ml-1.5 text-xs font-semibold">· bas</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={p.isActive ? 'success' : 'danger'}>
                        {p.isActive ? 'Actif' : 'Désactivé'}
                      </Badge>
                    </td>
                    <td className="px-2 py-3 text-muted">
                      <ChevronRight className="size-4" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {data.nextCursor ? (
        <div className="flex justify-center">
          <Link
            href={`/catalogue?${next}`}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-800 ring-1 ring-line hover:bg-brand-50"
          >
            Produits suivants
          </Link>
        </div>
      ) : null}
    </div>
  );
}
