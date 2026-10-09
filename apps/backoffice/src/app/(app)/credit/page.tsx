import {
  ADMIN_CREDIT_FILTER_LABELS,
  AdminCreditFilter,
  AdminCreditList,
  AdminCreditListQuery,
} from '@afrisime/shared';
import { ChevronRight, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { api } from '@/lib/api';
import { CREDIT_VIEW_ROLES } from '@/lib/credit';
import { formatPhone } from '@/lib/orders';
import { cn, formatDateTime, formatFCFA } from '@/lib/utils';

export const metadata: Metadata = { title: 'Crédit' };

const EMPTY: Record<AdminCreditFilter, string> = {
  requests: 'Aucune demande de crédit en attente. Tout est à jour.',
  active: 'Aucun crédit ouvert pour l’instant.',
  late: 'Aucune cliente en retard de remboursement.',
  suspended: 'Aucun crédit suspendu.',
  all: 'Aucune cliente n’a encore demandé de crédit.',
};

export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin({ roles: CREDIT_VIEW_ROLES });
  const raw = await searchParams;
  const parsed = AdminCreditListQuery.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => v)),
  );
  const query = parsed.success ? parsed.data : AdminCreditListQuery.parse({});

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, String(v));
  const data = await api(`/v1/admin/credit?${params}`, { schema: AdminCreditList });

  const hrefFor = (changes: { filter?: string; cursor?: string }) => {
    const next = new URLSearchParams();
    const filter = changes.filter ?? query.filter;
    if (filter !== 'requests') next.set('filter', filter);
    if (query.q) next.set('q', query.q);
    if (changes.cursor) next.set('cursor', changes.cursor);
    const qs = next.toString();
    return qs ? `/credit?${qs}` : '/credit';
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Vente à crédit</h1>
        <p className="mt-1 text-sm text-muted">
          Réservée aux revendeuses et aux professionnels validés. Chaque achat à crédit se rembourse
          un peu chaque jour ; en retard, la cliente ne peut plus acheter à crédit.
        </p>
      </div>

      <nav aria-label="Filtres" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {AdminCreditFilter.options.map((filter) => {
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
              {ADMIN_CREDIT_FILTER_LABELS[filter]}
              <span
                className={cn(
                  'min-w-6 rounded-full px-1.5 py-px text-center text-xs tabular-nums',
                  active
                    ? 'bg-white/15'
                    : n > 0 && filter === 'requests'
                      ? 'bg-accent-100 text-accent-600'
                      : n > 0 && filter === 'late'
                        ? 'bg-warning-50 text-warning'
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
        action="/credit"
        className="flex flex-wrap gap-3 rounded-2xl border border-line bg-white p-4"
      >
        {query.filter !== 'requests' ? (
          <input type="hidden" name="filter" value={query.filter} />
        ) : null}
        <label className="relative min-w-60 flex-1">
          <span className="sr-only">Rechercher une cliente</span>
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
      </form>

      <Card className="overflow-hidden">
        {data.items.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-muted">
            {query.q ? 'Aucune cliente ne correspond à cette recherche.' : EMPTY[query.filter]}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-canvas">
                <tr className="text-left text-xs font-semibold tracking-wide text-muted uppercase">
                  <th scope="col" className="px-5 py-3">
                    Cliente
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Situation
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Plafond
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Encours
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Dû aujourd’hui
                  </th>
                  <th scope="col" className="px-2 py-3">
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((r) => (
                  <tr
                    key={r.customer.id}
                    className={cn(
                      'group relative hover:bg-brand-50/60',
                      r.daysLate > 0 && 'bg-warning-50/40',
                    )}
                  >
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/credit/${r.customer.id}`}
                        className="font-bold text-ink after:absolute after:inset-0"
                      >
                        {r.customer.name ?? 'Cliente sans nom'}
                      </Link>
                      <p className="text-xs text-muted tabular-nums">
                        {formatPhone(r.customer.phone)} · {r.customer.typeLabel}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {r.pendingRequest ? (
                          <Badge tone="accent">
                            Demande : {formatFCFA(r.pendingRequest.amount)}
                          </Badge>
                        ) : null}
                        {r.status === 'suspended' ? <Badge tone="danger">Suspendu</Badge> : null}
                        {r.status === 'active' && r.daysLate === 0 ? (
                          <Badge tone="success">À jour</Badge>
                        ) : null}
                        {r.daysLate > 0 ? (
                          <Badge tone="warning">
                            {r.daysLate} jour{r.daysLate > 1 ? 's' : ''} de retard
                          </Badge>
                        ) : null}
                      </div>
                      {r.pendingRequest ? (
                        <p className="text-xs text-muted">
                          reçue {formatDateTime(r.pendingRequest.createdAt)}
                        </p>
                      ) : r.status !== 'none' ? (
                        <p className="text-xs text-muted">remboursement sur {r.termDays} jours</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums">
                      {r.status === 'none' ? '—' : formatFCFA(r.limit)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-ink tabular-nums">
                      {r.status === 'none' ? '—' : formatFCFA(r.used)}
                    </td>
                    <td
                      className={cn(
                        'px-5 py-3.5 text-right tabular-nums',
                        r.dueToday > 0 ? 'font-bold text-ink' : 'text-muted',
                      )}
                    >
                      {r.dueToday > 0 ? formatFCFA(r.dueToday) : '—'}
                    </td>
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
      {data.nextCursor ? (
        <div className="flex justify-center">
          <Link
            href={hrefFor({ cursor: data.nextCursor })}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-800 ring-1 ring-line hover:bg-brand-50"
          >
            Suivantes
          </Link>
        </div>
      ) : null}
    </div>
  );
}
