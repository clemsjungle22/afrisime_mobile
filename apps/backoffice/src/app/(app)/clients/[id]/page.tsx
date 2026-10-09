import { AdminCustomerDetail, PRICE_SEGMENT_LABELS } from '@afrisime/shared';
import { ArrowLeft, ChevronRight, MapPin, Phone, Store, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { ApiError, api } from '@/lib/api';
import { CUSTOMER_VIEW_ROLES } from '@/lib/customers';
import { STATUS_TONES, formatPhone } from '@/lib/orders';
import { ORDER_STATUS_LABELS, formatDateTime, formatFCFA } from '@/lib/utils';
import { CustomerActions } from './customer-actions';

export const metadata: Metadata = { title: 'Client' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ roles: CUSTOMER_VIEW_ROLES });
  const { id } = await params;
  let c: AdminCustomerDetail;
  try {
    c = await api(`/v1/admin/customers/${encodeURIComponent(id)}`, {
      schema: AdminCustomerDetail,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/clients"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Clients
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              {c.name ?? 'Client sans nom'}
            </h1>
            {c.status === 'blocked' ? <Badge tone="danger">Compte bloqué</Badge> : null}
            {c.typePending ? <Badge tone="accent">Profil pro à valider</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            Inscrit le {formatDateTime(c.createdAt)}
            {c.lastSeenAt
              ? ` · dernière utilisation de l’app le ${formatDateTime(c.lastSeenAt)}`
              : ''}
          </p>
        </div>
      </div>

      {c.typePending ? (
        <Alert tone="warning">
          Ce client s’est déclaré <strong>{c.customerType?.label}</strong>. Il paie le tarif
          particulier tant que son profil n’est pas validé.
        </Alert>
      ) : null}
      {c.status === 'blocked' ? (
        <Alert tone="danger">
          Ce compte est bloqué : le client ne peut plus se connecter à l’app. Voir le motif dans
          l’historique.
        </Alert>
      ) : null}

      <CustomerActions customer={c} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Commandes" value={String(c.orderCount)} />
        <Stat label="Total dépensé" value={formatFCFA(c.totalSpent)} hint="Livrées ou retirées" />
        <Stat
          label="Panier moyen"
          value={c.averageBasket > 0 ? formatFCFA(c.averageBasket) : '—'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="Commandes"
              description={c.orders.length >= 50 ? 'Les 50 plus récentes' : undefined}
            />
            {c.orders.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Aucune commande.</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.orders.map((o) => (
                  <li
                    key={o.id}
                    className="relative flex items-center gap-4 px-5 py-3 hover:bg-brand-50/60"
                  >
                    {o.fulfillment === 'delivery' ? (
                      <Truck className="size-4 shrink-0 text-muted" aria-label="Livraison" />
                    ) : (
                      <Store className="size-4 shrink-0 text-muted" aria-label="Retrait" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/commandes/${o.id}`}
                        className="font-bold text-ink after:absolute after:inset-0"
                      >
                        {o.orderNumber}
                      </Link>
                      <p className="text-xs text-muted">{formatDateTime(o.createdAt)}</p>
                    </div>
                    <Badge tone={STATUS_TONES[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                    <span className="w-24 text-right font-bold text-ink tabular-nums">
                      {formatFCFA(o.total)}
                    </span>
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Historique du compte" />
            {c.history.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">
                Aucune intervention sur ce compte.
              </p>
            ) : (
              <ol className="flex flex-col gap-4 px-5 py-4">
                {c.history.map((h, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600"
                      aria-hidden
                    />
                    <div>
                      <p className="font-semibold text-ink">{h.label}</p>
                      <p className="text-xs text-muted">
                        {formatDateTime(h.at)} · {h.actorName ?? 'le client'}
                      </p>
                      {h.reason ? <p className="mt-1 text-muted">« {h.reason} »</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Coordonnées" />
            <dl className="flex flex-col gap-3 px-5 py-4 text-sm">
              <Row label="Téléphone">
                <a
                  href={`tel:${c.phone}`}
                  className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
                >
                  <Phone className="size-3.5" aria-hidden /> {formatPhone(c.phone)}
                </a>
              </Row>
              <Row label="E-mail">{c.email ?? '—'}</Row>
              <Row label="Profil déclaré">{c.customerType?.label ?? 'Non renseigné'}</Row>
              <Row label="Tarif appliqué">
                <Badge tone={c.segment === 'pro' ? 'accent' : 'neutral'}>
                  {PRICE_SEGMENT_LABELS[c.segment]}
                </Badge>
              </Row>
              <Row label="Agence">{c.agencyName ?? '—'}</Row>
              <Row label="Offres et promotions">
                {c.marketingConsent ? 'Accepte de les recevoir' : 'Refuse'}
              </Row>
              <Row label="Avoir">
                {c.storeCreditBalance > 0 ? formatFCFA(c.storeCreditBalance) : '—'}
              </Row>
              <Row label="Vente à crédit">
                <Link href={`/credit/${c.id}`} className="font-semibold text-brand-800 hover:underline">
                  Voir ou accorder un crédit
                </Link>
              </Row>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Adresses de livraison" />
            {c.addresses.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Aucune adresse.</p>
            ) : (
              <ul className="divide-y divide-line">
                {c.addresses.map((a) => (
                  <li key={a.id} className="flex gap-3 px-5 py-3.5 text-sm">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                    <div>
                      <p className="font-semibold text-ink">
                        {a.label}{' '}
                        {a.isDefault ? (
                          <Badge tone="neutral" className="ml-1">
                            Par défaut
                          </Badge>
                        ) : null}
                      </p>
                      <p className="text-ink">
                        {a.district}, {a.city} · {a.landmark}
                      </p>
                      <p className="text-xs text-muted">
                        {a.recipientName} · {formatPhone(a.phone)}
                        {a.zoneName ? ` · ${a.zoneName}` : ''}
                      </p>
                      {a.instructions ? (
                        <p className="text-xs text-muted">« {a.instructions} »</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-ink tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
