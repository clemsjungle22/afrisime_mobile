import {
  AdminCarnetDetail,
  CARNET_STATUS_LABELS,
  CONTRIBUTION_METHOD_LABELS,
  OnboardingOptions,
} from '@afrisime/shared';
import { ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { ApiError, api } from '@/lib/api';
import { formatPhone } from '@/lib/orders';
import { CARNET_VIEW_ROLES } from '@/lib/packs';
import { formatDateTime, formatFCFA } from '@/lib/utils';
import { CashButton } from './cash-form';

export const metadata: Metadata = { title: 'Carnet' };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Africa/Lome' });

export default async function CarnetPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ roles: CARNET_VIEW_ROLES });
  const { id } = await params;
  let c: AdminCarnetDetail;
  try {
    c = await api(`/v1/admin/carnets/${encodeURIComponent(id)}`, { schema: AdminCarnetDetail });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const options = c.canRecordCash
    ? await api('/v1/onboarding/options', { schema: OnboardingOptions, auth: false })
    : null;
  const ratio = c.price > 0 ? Math.min(1, c.paid / c.price) : 0;
  const late = c.status === 'active' && c.daysLate > 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href="/packs?onglet=carnets"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Carnets
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">{c.packName}</h1>
            {late ? (
              <Badge tone="warning">
                {c.daysLate} jour{c.daysLate > 1 ? 's' : ''} de retard
              </Badge>
            ) : (
              <Badge tone={c.status === 'completed' ? 'accent' : 'neutral'}>
                {CARNET_STATUS_LABELS[c.status]}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            <Link
              href={`/clients/${c.customer.id}`}
              className="font-semibold text-ink hover:underline"
            >
              {c.customer.name ?? 'Client sans nom'}
            </Link>{' '}
            · {formatPhone(c.customer.phone)} · ouvert le {dateFmt.format(new Date(c.startedAt))}
          </p>
        </div>
        {c.canRecordCash && options ? (
          <CashButton
            carnetId={c.id}
            dailyAmount={c.dailyAmount}
            remaining={c.remaining}
            agencies={options.agencies.map((a) => ({ id: a.id, name: a.name }))}
          />
        ) : null}
      </div>

      {c.status === 'completed' ? (
        <Alert tone="success">
          Carnet soldé le {c.completedAt ? formatDateTime(c.completedAt) : '—'} : contactez le
          client pour lui remettre son pack.
        </Alert>
      ) : null}

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-2xl font-extrabold text-ink tabular-nums">
            {formatFCFA(c.paid)}{' '}
            <span className="text-base font-semibold text-muted">sur {formatFCFA(c.price)}</span>
          </p>
          <p className="text-sm text-muted">
            {formatFCFA(c.dailyAmount)} / jour · {c.durationDays} jours · échéance le{' '}
            {dateFmt.format(new Date(c.dueAt))}
          </p>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full bg-brand-50"
          role="progressbar"
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={late ? 'h-full bg-warning' : 'h-full bg-brand-600'}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <p className="text-sm text-ink">
          Reste à verser : <strong>{formatFCFA(c.remaining)}</strong>
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Cotisations" description="La plus récente d’abord." />
          {c.contributions.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Aucune cotisation pour l’instant.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {c.contributions.map((x) => (
                <li key={x.id} className="flex items-start gap-3 px-5 py-3.5 text-sm">
                  {x.status === 'succeeded' ? (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-brand-600"
                      aria-label="Reçue"
                    />
                  ) : x.status === 'pending' ? (
                    <Clock className="mt-0.5 size-4 shrink-0 text-info" aria-label="En attente" />
                  ) : (
                    <XCircle
                      className="mt-0.5 size-4 shrink-0 text-danger"
                      aria-label="Non aboutie"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink tabular-nums">{formatFCFA(x.amount)}</p>
                    <p className="text-xs text-muted">
                      {CONTRIBUTION_METHOD_LABELS[x.method]}
                      {x.agencyName ? ` · ${x.agencyName}` : ''}
                      {x.recordedBy ? ` · encaissé par ${x.recordedBy}` : ''} ·{' '}
                      {formatDateTime(x.createdAt)}
                    </p>
                    {x.note ? <p className="text-xs text-muted">« {x.note} »</p> : null}
                    {x.failureReason ? (
                      <p className="text-xs text-danger">{x.failureReason}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Contenu du pack" description="Figé à la souscription." />
          <ul className="flex flex-col gap-2 px-5 py-4 text-sm">
            {c.items.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-3">
                <span className="text-ink">
                  {i.productName} · {i.variantLabel}
                </span>
                <span className="font-semibold tabular-nums">× {i.quantity}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
