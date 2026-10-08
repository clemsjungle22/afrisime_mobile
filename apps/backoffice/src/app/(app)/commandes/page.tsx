import {
  ADMIN_ORDER_TAB_LABELS,
  AdminOrderList,
  AdminOrderListQuery,
  type AdminOrderTab,
  OnboardingOptions,
} from '@afrisime/shared';
import { ChevronRight, Search, Store, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { api } from '@/lib/api';
import { PAYMENT_SHORT, STATUS_TONES, formatPhone, formatSlot } from '@/lib/orders';
import { ORDER_STATUS_LABELS, cn, formatDateTime, formatFCFA } from '@/lib/utils';
import { AutoRefresh } from './auto-refresh';

export const metadata: Metadata = { title: 'Commandes' };

const TABS: AdminOrderTab[] = [
  'to_prepare',
  'preparing',
  'dispatch',
  'awaiting_payment',
  'done',
  'cancelled',
  'all',
];
const FILTER_KEYS = ['q', 'fulfillment', 'agencyId', 'paymentMethod', 'from', 'to'] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin({ roles: ['admin', 'orders', 'support', 'readonly'] });
  const raw = await searchParams;
  const parsed = AdminOrderListQuery.safeParse(
    Object.fromEntries(Object.entries(raw).filter(([, v]) => v)),
  );
  const query = parsed.success ? parsed.data : AdminOrderListQuery.parse({});

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== '') params.set(k, String(v));
  const [data, options] = await Promise.all([
    api(`/v1/admin/orders?${params}`, { schema: AdminOrderList }),
    api('/v1/onboarding/options', { schema: OnboardingOptions, auth: false }),
  ]);

  /** Lien vers un onglet en gardant les filtres. */
  const hrefFor = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const key of [...FILTER_KEYS, 'tab'] as const) {
      const value = key in changes ? changes[key] : (query as Record<string, unknown>)[key];
      if (value) next.set(key, String(value));
    }
    return `/commandes?${next}`;
  };
  const filtered = FILTER_KEYS.some((k) => query[k]);

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Commandes</h1>
          <p className="mt-1 text-sm text-muted">Mise à jour automatique toutes les 30 secondes.</p>
        </div>
      </div>

      <nav aria-label="Étapes" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((tab) => {
          const active = query.tab === tab;
          const n = data.counts[tab] ?? 0;
          return (
            <Link
              key={tab}
              href={hrefFor({ tab, cursor: undefined })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'bg-brand-900 text-white'
                  : 'bg-white text-muted ring-1 ring-line hover:text-ink',
              )}
            >
              {ADMIN_ORDER_TAB_LABELS[tab]}
              <span
                className={cn(
                  'min-w-6 rounded-full px-1.5 py-px text-center text-xs tabular-nums',
                  active
                    ? 'bg-white/15'
                    : n > 0 && (tab === 'to_prepare' || tab === 'dispatch')
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
        action="/commandes"
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.6fr_repeat(5,1fr)_auto]"
      >
        <input type="hidden" name="tab" value={query.tab} />
        <label className="relative sm:col-span-2 lg:col-span-3 xl:col-span-1">
          <span className="sr-only">Rechercher</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={query.q}
            placeholder="N°, téléphone ou nom"
            className="h-10 w-full rounded-xl border border-line pr-3 pl-9 text-sm focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
          />
        </label>
        <Select
          name="fulfillment"
          label="Réception"
          value={query.fulfillment}
          options={[
            ['delivery', 'Livraison'],
            ['pickup', 'Retrait'],
          ]}
        />
        <Select
          name="agencyId"
          label="Agence"
          value={query.agencyId}
          options={options.agencies.map((a) => [a.id, a.name])}
        />
        <Select
          name="paymentMethod"
          label="Paiement"
          value={query.paymentMethod}
          options={Object.entries(PAYMENT_SHORT)}
        />
        <DateInput name="from" label="Du" value={query.from} />
        <DateInput name="to" label="Au" value={query.to} />
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-10 cursor-pointer rounded-xl bg-brand-900 px-4 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Filtrer
          </button>
          {filtered ? (
            <Link
              href={`/commandes?tab=${query.tab}`}
              className="grid h-10 place-items-center rounded-xl px-3 text-sm font-semibold text-muted hover:bg-brand-50"
            >
              Effacer
            </Link>
          ) : null}
        </div>
      </form>

      <Card className="overflow-hidden">
        {data.items.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-muted">
            {filtered
              ? 'Aucune commande ne correspond à ces filtres.'
              : 'Aucune commande dans cette étape.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-canvas">
                <tr className="text-left text-xs font-semibold tracking-wide text-muted uppercase">
                  <th scope="col" className="px-5 py-3">
                    Commande
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Réception · créneau
                  </th>
                  <th scope="col" className="px-5 py-3 text-right">
                    Total
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Paiement
                  </th>
                  <th scope="col" className="px-5 py-3">
                    Étape
                  </th>
                  <th scope="col" className="px-2 py-3">
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((o) => {
                  const slot = formatSlot(o.slot);
                  return (
                    <tr key={o.id} className="group relative hover:bg-brand-50/60">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/commandes/${o.id}`}
                          className="font-bold text-ink after:absolute after:inset-0"
                        >
                          {o.orderNumber}
                        </Link>
                        <p className="text-xs text-muted">{formatDateTime(o.createdAt)}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-ink">
                          {o.customer.name ?? 'Client sans nom'}
                        </p>
                        <p className="text-xs text-muted tabular-nums">
                          {formatPhone(o.customer.phone)}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="flex items-center gap-1.5 text-ink">
                          {o.fulfillment === 'delivery' ? (
                            <Truck className="size-4 text-muted" aria-label="Livraison" />
                          ) : (
                            <Store className="size-4 text-muted" aria-label="Retrait" />
                          )}
                          <span className="max-w-64 truncate">
                            {o.fulfillmentSummary.replace(/^(Livraison|Retrait) · /, '')}
                          </span>
                        </p>
                        <p
                          className={cn(
                            'text-xs',
                            slot.today ? 'font-bold text-accent-600' : 'text-muted',
                          )}
                        >
                          {slot.label}
                        </p>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <p className="font-bold text-ink tabular-nums">{formatFCFA(o.total)}</p>
                        <p className="text-xs text-muted">
                          {o.itemCount} article{o.itemCount > 1 ? 's' : ''}
                        </p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-ink">{PAYMENT_SHORT[o.paymentMethod]}</p>
                        {o.amountDue > 0 ? (
                          <p className="text-xs font-semibold text-warning">À encaisser</p>
                        ) : o.paymentStatus === 'succeeded' ? (
                          <p className="text-xs text-brand-700">Payé</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={STATUS_TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                      </td>
                      <td className="px-2 py-3.5 text-muted">
                        <ChevronRight className="size-4" aria-hidden />
                      </td>
                    </tr>
                  );
                })}
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
            Commandes suivantes
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col">
      <span className="sr-only">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
      >
        <option value="">{label} : tous</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm focus-within:border-brand-600 focus-within:ring-3 focus-within:ring-brand-200">
      <span className="text-muted">{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={value}
        className="h-10 w-full bg-transparent text-ink focus:outline-none"
      />
    </label>
  );
}
