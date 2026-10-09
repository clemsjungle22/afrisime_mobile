import {
  ADMIN_CARNET_FILTER_LABELS,
  AdminCarnetFilter,
  AdminCarnetList,
  AdminCarnetListQuery,
  AdminPack,
  AdminPackFormat,
  CARNET_STATUS_LABELS,
} from '@afrisime/shared';
import { ChevronRight, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { Badge, Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { api, mediaSrc } from '@/lib/api';
import { formatPhone } from '@/lib/orders';
import { CARNET_VIEW_ROLES, PACK_EDIT_ROLES, PACK_VIEW_ROLES } from '@/lib/packs';
import { cn, formatFCFA } from '@/lib/utils';
import { PacksManager } from './packs-manager';

export const metadata: Metadata = { title: 'Packs Famille' };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Africa/Lome' });
const formatDate = (iso: string) => dateFmt.format(new Date(iso));

export default async function PacksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin({ roles: PACK_VIEW_ROLES });
  const raw = await searchParams;
  const canSeeCarnets = CARNET_VIEW_ROLES.includes(admin.role);
  const tab = raw.onglet === 'carnets' && canSeeCarnets ? 'carnets' : 'offres';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Packs Famille</h1>
        <p className="mt-1 text-sm text-muted">
          Le client cotise chaque jour (Mobile Money ou espèces en agence) puis reçoit les produits
          à l’échéance. Contenu et prix sont figés à la souscription.
        </p>
      </div>
      {canSeeCarnets ? (
        <nav aria-label="Rubriques" className="flex gap-1">
          {(
            [
              ['offres', 'Offres'],
              ['carnets', 'Carnets des clients'],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={key === 'offres' ? '/packs' : '/packs?onglet=carnets'}
              aria-current={tab === key ? 'page' : undefined}
              className={cn(
                'rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
                tab === key
                  ? 'bg-brand-900 text-white'
                  : 'bg-white text-muted ring-1 ring-line hover:text-ink',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      ) : null}
      {tab === 'offres' ? (
        <Offers canEdit={PACK_EDIT_ROLES.includes(admin.role)} />
      ) : (
        <Carnets raw={raw} />
      )}
    </div>
  );
}

async function Offers({ canEdit }: { canEdit: boolean }) {
  const [packs, formats] = await Promise.all([
    api('/v1/admin/packs', { schema: z.array(AdminPack) }),
    canEdit
      ? api('/v1/admin/packs/formats', { schema: z.array(AdminPackFormat) })
      : Promise.resolve([]),
  ]);
  return (
    <PacksManager
      packs={packs}
      srcs={Object.fromEntries(packs.map((p) => [p.id, mediaSrc(p.imageUrl)]))}
      formats={formats}
      canEdit={canEdit}
    />
  );
}

async function Carnets({ raw }: { raw: Record<string, string | undefined> }) {
  const parsed = AdminCarnetListQuery.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([k, v]) => v && k !== 'onglet')),
  );
  const query = parsed.success ? parsed.data : AdminCarnetListQuery.parse({});
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, String(v));
  const data = await api(`/v1/admin/carnets?${params}`, { schema: AdminCarnetList });

  const hrefFor = (changes: { filter?: string; cursor?: string }) => {
    const next = new URLSearchParams({ onglet: 'carnets', filter: changes.filter ?? query.filter });
    if (query.q) next.set('q', query.q);
    if (changes.cursor) next.set('cursor', changes.cursor);
    return `/packs?${next}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Filtres" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {AdminCarnetFilter.options.map((f) => {
          const active = query.filter === f;
          const n = data.counts[f] ?? 0;
          return (
            <Link
              key={f}
              href={hrefFor({ filter: f })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-brand-900 text-white'
                  : 'bg-white text-muted ring-1 ring-line hover:text-ink',
              )}
            >
              {ADMIN_CARNET_FILTER_LABELS[f]}
              <span
                className={cn(
                  'min-w-6 rounded-full px-1.5 py-px text-center text-xs tabular-nums',
                  active
                    ? 'bg-white/15'
                    : n > 0 && (f === 'late' || f === 'completed')
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
        action="/packs"
        className="flex flex-wrap gap-3 rounded-2xl border border-line bg-white p-4"
      >
        <input type="hidden" name="onglet" value="carnets" />
        <input type="hidden" name="filter" value={query.filter} />
        <label className="relative min-w-60 flex-1">
          <span className="sr-only">Rechercher un carnet</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Nom, téléphone ou pack"
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
          <p className="px-5 py-14 text-center text-sm text-muted">Aucun carnet ici.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-canvas">
                <tr className="text-left text-xs font-semibold tracking-wide text-muted uppercase">
                  <th scope="col" className="px-5 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Pack
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Versé
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Reste
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Échéance
                  </th>
                  <th scope="col" className="px-5 py-3">
                    État
                  </th>
                  <th scope="col" className="px-2 py-3">
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((c) => (
                  <tr key={c.id} className="relative hover:bg-brand-50/60">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/packs/carnets/${c.id}`}
                        className="font-bold text-ink after:absolute after:inset-0"
                      >
                        {c.customer.name ?? 'Client sans nom'}
                      </Link>
                      <p className="text-xs text-muted tabular-nums">
                        {formatPhone(c.customer.phone)}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-ink">{c.packName}</p>
                      <p className="text-xs text-muted">{formatFCFA(c.dailyAmount)} / jour</p>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold tabular-nums">
                      {formatFCFA(c.paid)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums">
                      {formatFCFA(c.remaining)}
                    </td>
                    <td className="px-5 py-3.5 text-muted">{formatDate(c.dueAt)}</td>
                    <td className="px-5 py-3.5">
                      {c.status === 'active' && c.daysLate > 0 ? (
                        <Badge tone="warning">{c.daysLate} j de retard</Badge>
                      ) : (
                        <Badge
                          tone={
                            c.status === 'completed'
                              ? 'accent'
                              : c.status === 'active'
                                ? 'info'
                                : 'neutral'
                          }
                        >
                          {CARNET_STATUS_LABELS[c.status]}
                        </Badge>
                      )}
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
            Carnets suivants
          </Link>
        </div>
      ) : null}
    </div>
  );
}
