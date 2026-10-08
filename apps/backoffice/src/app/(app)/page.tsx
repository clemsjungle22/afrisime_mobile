import { ADMIN_ORDER_TABS, AdminDashboard } from '@afrisime/shared';
import { AlertTriangle, Banknote, ClipboardList, PackageCheck, UserCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { api } from '@/lib/api';
import { CUSTOMER_VIEW_ROLES } from '@/lib/customers';
import { ORDER_STATUS_LABELS, cn, formatDay, formatFCFA } from '@/lib/utils';

export const metadata: Metadata = { title: 'Tableau de bord' };

/** Ordre d'affichage des commandes ouvertes : ce qui demande une action d'abord. */
const STATUS_ORDER = [
  'confirmed',
  'preparing',
  'ready_for_pickup',
  'out_for_delivery',
  'pending_payment',
  'payment_failed',
];
const TO_HANDLE = new Set(['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery']);

/** Onglet de la page Commandes qui contient ce statut. */
const tabOf = (status: string) =>
  (Object.entries(ADMIN_ORDER_TABS) as [string, readonly string[]][]).find(([, statuses]) =>
    statuses.includes(status),
  )?.[0] ?? 'all';

function Stat({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
  href,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone?: 'brand' | 'accent' | 'warning';
  hint?: string;
  href?: string;
}) {
  const card = (
    <Card className={cn('h-full p-5', href && 'transition-shadow hover:shadow-md')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-muted">{label}</p>
        <span
          className={cn(
            'grid size-9 place-items-center rounded-xl',
            tone === 'brand' && 'bg-brand-50 text-brand-700',
            tone === 'accent' && 'bg-accent-100 text-accent-600',
            tone === 'warning' && 'bg-warning-50 text-warning',
          )}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight text-ink tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-2xl">
      {card}
    </Link>
  ) : (
    card
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [admin, data, params] = await Promise.all([
    requireAdmin(),
    api('/v1/admin/dashboard', { schema: AdminDashboard }),
    searchParams,
  ]);
  const open = [...data.openByStatus].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );
  const toHandle = open.filter((o) => TO_HANDLE.has(o.status)).reduce((n, o) => n + o.count, 0);
  const firstName = admin.name.split(/\s+/)[0];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm font-semibold text-muted first-letter:uppercase">
          {formatDay(data.day)}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
          Bonjour {firstName}
        </h1>
      </div>

      {params.bienvenue ? (
        <Alert tone="success">Mot de passe enregistré. Votre compte est prêt.</Alert>
      ) : null}

      <section aria-label="Chiffres du jour" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Commandes du jour"
          value={String(data.ordersToday)}
          icon={<ClipboardList className="size-5" />}
          href={`/commandes?tab=all&from=${data.day.slice(0, 10)}&to=${data.day.slice(0, 10)}`}
        />
        <Stat
          label="Encaissé aujourd’hui"
          value={formatFCFA(data.revenueToday)}
          icon={<Banknote className="size-5" />}
          tone="accent"
          hint={`${data.paidOrdersToday} paiement${data.paidOrdersToday > 1 ? 's' : ''} reçu${data.paidOrdersToday > 1 ? 's' : ''}`}
        />
        <Stat
          label="À traiter"
          value={String(toHandle)}
          icon={<PackageCheck className="size-5" />}
          hint="À préparer, en cours ou en livraison"
          href="/commandes?tab=to_prepare"
        />
        <Stat
          label="Comptes pro à valider"
          value={String(data.pendingProAccounts)}
          icon={<UserCheck className="size-5" />}
          tone={data.pendingProAccounts > 0 ? 'warning' : 'brand'}
          hint="Revendeurs, restaurants, PME"
          href={
            CUSTOMER_VIEW_ROLES.includes(admin.role) ? '/clients?filter=pending_pro' : undefined
          }
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader
            title="Commandes en cours"
            description="Par étape, ce qui demande une action en premier."
          />
          {open.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Aucune commande en cours.</p>
          ) : (
            <ul className="divide-y divide-line">
              {open.map((o) => (
                <li key={o.status}>
                  <Link
                    href={`/commandes?tab=${tabOf(o.status)}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-brand-50/60"
                  >
                    <Badge
                      tone={
                        TO_HANDLE.has(o.status)
                          ? 'success'
                          : o.status === 'payment_failed'
                            ? 'danger'
                            : 'info'
                      }
                    >
                      {ORDER_STATUS_LABELS[o.status] ?? o.status}
                    </Badge>
                    <span className="text-lg font-bold text-ink tabular-nums">{o.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Stock bas et ruptures"
            description="Formats vendables sous leur seuil d’alerte, toutes agences confondues."
          />
          {data.lowStock.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Aucun format sous son seuil.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold tracking-wide text-muted uppercase">
                    <th scope="col" className="px-5 py-2.5">
                      Produit
                    </th>
                    <th scope="col" className="px-5 py-2.5">
                      Format
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right">
                      Disponible
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right">
                      Seuil
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.lowStock.map((l) => (
                    <tr key={l.variantId}>
                      <td className="px-5 py-3 font-semibold text-ink">{l.productName}</td>
                      <td className="px-5 py-3 text-muted">{l.variantLabel}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {l.sellable <= 0 ? (
                          <Badge tone="danger">
                            <AlertTriangle className="size-3" aria-hidden /> Rupture
                          </Badge>
                        ) : (
                          <span className="font-bold text-warning">{l.sellable}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-muted tabular-nums">
                        {l.threshold}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
