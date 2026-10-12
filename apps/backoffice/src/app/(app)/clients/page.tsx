import {
  ADMIN_CUSTOMER_FILTER_LABELS,
  AdminCustomerFilter,
  AdminCustomerList,
  AdminCustomerListQuery,
  PRICE_SEGMENT_LABELS,
} from '@afrisime/shared';
import { ChevronRight, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { api } from '@/lib/api';
import { CUSTOMER_VIEW_ROLES } from '@/lib/customers';
import { formatPhone } from '@/lib/orders';
import { cn, formatDateTime, formatFCFA } from '@/lib/utils';

export const metadata: Metadata = { title: 'Clients' };

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Africa/Lome' }).format(
    new Date(iso),
  );

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin({ roles: CUSTOMER_VIEW_ROLES });
  const raw = await searchParams;
  const parsed = AdminCustomerListQuery.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => v)),
  );
  const query = parsed.success ? parsed.data : AdminCustomerListQuery.parse({});

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, String(v));
  const data = await api(`/v1/admin/customers?${params}`, { schema: AdminCustomerList });

  const hrefFor = (changes: { filter?: string; cursor?: string }) => {
    const next = new URLSearchParams();
    const filter = changes.filter ?? query.filter;
    if (filter !== 'all') next.set('filter', filter);
    if (query.q) next.set('q', query.q);
    if (changes.cursor) next.set('cursor', changes.cursor);
    const qs = next.toString();
    return qs ? `/clients?${qs}` : '/clients';
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Clients</h1>
        <p className="mt-1 text-sm text-muted">
          Comptes créés dans l’app. Les profils pros déclarés attendent votre validation avant
          d’avoir les tarifs pros.
        </p>
      </div>

      <nav aria-label="Filtres" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {AdminCustomerFilter.options.map((filter) => {
          const active = query.filter === filter;
          const n = data.counts[filter] ?? 0;
          return (
            <Link
              key={filter}
              href={hrefFor({ filter })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-brand-900 text-white'
                  : 'bg-white text-muted ring-1 ring-line hover:text-ink',
              )}
            >
              {ADMIN_CUSTOMER_FILTER_LABELS[filter]}
              <span
                className={cn(
                  'min-w-6 rounded-full px-1.5 py-px text-center text-xs tabular-nums',
                  active
                    ? 'bg-white/15'
                    : n > 0 && (filter === 'pending_pro' || filter === 'kyc_pending')
                      ? 'bg-accent-100 text-accent-600'
                      : 'bg-brand-50',
                )}
              >
                {n}
              </span>
            </Link>
          );
        })}
      </nav>

      <form
        method="get"
        action="/clients"
        className="flex flex-wrap gap-3 rounded-2xl border border-line bg-white p-4"
      >
        {query.filter !== 'all' ? <input type="hidden" name="filter" value={query.filter} /> : null}
        <label className="relative min-w-60 flex-1">
          <span className="sr-only">Rechercher un client</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Nom ou téléphone"
            className="h-10 w-full rounded-xl border border-line pr-3 pl-9 text-sm focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="h-10 cursor-pointer rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Rechercher
        </button>
        {query.q ? (
          <Link
            href={query.filter === 'all' ? '/clients' : `/clients?filter=${query.filter}`}
            className="grid h-10 place-items-center rounded-xl px-3 text-sm font-semibold text-muted hover:bg-brand-50"
          >
            Effacer
          </Link>
        ) : null}
      </form>

      <Card className="overflow-hidden">
        {data.items.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-muted">
            {query.q
              ? 'Aucun client ne correspond à cette recherche.'
              : query.filter === 'pending_pro'
                ? 'Aucun profil pro à valider. Tout est à jour.'
                : query.filter === 'kyc_pending'
                  ? 'Aucune identité à vérifier. Tout est à jour.'
                : 'Aucun client ici.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-canvas">
                <tr className="text-left text-xs font-semibold tracking-wide text-muted uppercase">
                  <th scope="col" className="px-5 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Profil · tarif
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Agence
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Commandes
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Total dépensé
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Inscrit le
                  </th>
                  <th scope="col" className="px-2 py-3">
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      'group relative hover:bg-brand-50/60',
                      c.status === 'blocked' && 'bg-danger-50/40',
                    )}
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-bold text-ink after:absolute after:inset-0"
                      >
                        {c.name ?? 'Client sans nom'}
                      </Link>
                      <p className="text-xs text-muted tabular-nums">{formatPhone(c.phone)}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink">{c.customerType?.label ?? 'Non renseigné'}</span>
                        {c.typePending ? <Badge tone="accent">À valider</Badge> : null}
                        {c.kycStatus === 'pending' ? <Badge tone="accent">Identité à vérifier</Badge> : null}
                        {c.kycStatus === 'verified' ? <Badge tone="success">Identité vérifiée</Badge> : null}
                        {c.status === 'blocked' ? <Badge tone="danger">Bloqué</Badge> : null}
                      </div>
                      <p
                        className={cn(
                          'text-xs',
                          c.segment === 'pro' ? 'font-semibold text-accent-600' : 'text-muted',
                        )}
                      >
                        Tarif {PRICE_SEGMENT_LABELS[c.segment].toLowerCase()}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-ink">{c.agencyName ?? '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <p className="font-semibold text-ink tabular-nums">{c.orderCount}</p>
                      {c.lastOrderAt ? (
                        <p className="text-xs text-muted">
                          dernière {formatDateTime(c.lastOrderAt)}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold text-ink tabular-nums">
                      {formatFCFA(c.totalSpent)}
                    </td>
                    <td className="px-5 py-3.5 text-muted">{formatDate(c.createdAt)}</td>
                    <td className="px-2 py-3.5 text-muted">
                      <ChevronRight className="size-4" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-muted">
        Total dépensé : commandes livrées ou retirées uniquement.
      </p>
      {data.nextCursor ? (
        <div className="flex justify-center">
          <Link
            href={hrefFor({ cursor: data.nextCursor })}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-800 ring-1 ring-line hover:bg-brand-50"
          >
            Clients suivants
          </Link>
        </div>
      ) : null}
    </div>
  );
}
