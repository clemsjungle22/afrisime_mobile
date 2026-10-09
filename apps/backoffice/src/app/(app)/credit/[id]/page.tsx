import { AdminCreditDetail, OnboardingOptions, REPAYMENT_METHOD_LABELS } from '@afrisime/shared';
import { ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { ApiError, api } from '@/lib/api';
import { CREDIT_VIEW_ROLES } from '@/lib/credit';
import { formatPhone } from '@/lib/orders';
import { formatDateTime, formatFCFA } from '@/lib/utils';
import { CreditActions } from './credit-actions';

export const metadata: Metadata = { title: 'Crédit' };

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Africa/Lome' });
const DEBT_LABELS = { open: 'En cours', settled: 'Remboursée', cancelled: 'Annulée' } as const;
const REQUEST_LABELS = {
  pending: 'En attente',
  approved: 'Acceptée',
  rejected: 'Refusée',
} as const;

export default async function CreditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ roles: CREDIT_VIEW_ROLES });
  const { id } = await params;
  let c: AdminCreditDetail;
  try {
    c = await api(`/v1/admin/credit/${encodeURIComponent(id)}`, { schema: AdminCreditDetail });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const options = c.canRecordCash
    ? await api('/v1/onboarding/options', { schema: OnboardingOptions, auth: false })
    : null;
  const ratio = c.limit > 0 ? Math.min(1, c.used / c.limit) : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href="/credit"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Vente à crédit
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">
              {c.customer.name ?? 'Cliente sans nom'}
            </h1>
            {c.status === 'suspended' ? (
              <Badge tone="danger">Crédit suspendu</Badge>
            ) : c.daysLate > 0 ? (
              <Badge tone="warning">
                {c.daysLate} jour{c.daysLate > 1 ? 's' : ''} de retard
              </Badge>
            ) : c.status === 'active' ? (
              <Badge tone="success">Crédit à jour</Badge>
            ) : (
              <Badge tone="neutral">Pas de crédit</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            <Link
              href={`/clients/${c.customer.id}`}
              className="font-semibold text-ink hover:underline"
            >
              Voir la fiche client
            </Link>{' '}
            · {formatPhone(c.customer.phone)} · {c.customer.typeLabel}
          </p>
        </div>
        <CreditActions
          detail={c}
          agencies={options ? options.agencies.map((a) => ({ id: a.id, name: a.name })) : []}
        />
      </div>

      {c.pendingRequest ? (
        <Alert tone="info">
          Demande de crédit de <strong>{formatFCFA(c.pendingRequest.amount)}</strong> reçue le{' '}
          {formatDateTime(c.pendingRequest.createdAt)}
          {c.pendingRequest.message ? <> : « {c.pendingRequest.message} »</> : '.'}
          {c.canManage ? ' Accordez le crédit (plafond et durée) ou refusez la demande.' : ''}
        </Alert>
      ) : null}
      {!c.isProValidated && c.status === 'none' ? (
        <Alert tone="warning">
          Le crédit est réservé aux comptes pros validés : validez d’abord le profil de cette
          cliente depuis sa fiche.
        </Alert>
      ) : null}
      {c.status === 'suspended' ? (
        <Alert tone="danger">
          Crédit suspendu{c.suspendedReason ? ` : ${c.suspendedReason}` : ''}. La cliente ne peut
          plus acheter à crédit mais peut continuer à rembourser.
        </Alert>
      ) : null}

      {c.status !== 'none' ? (
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-2xl font-extrabold text-ink tabular-nums">
              {formatFCFA(c.used)}{' '}
              <span className="text-base font-semibold text-muted">
                utilisés sur {formatFCFA(c.limit)}
              </span>
            </p>
            <p className="text-sm text-muted">
              Remboursement sur {c.termDays} jours
              {c.grantedAt ? ` · accordé le ${dateFmt.format(new Date(c.grantedAt))}` : ''}
              {c.grantedBy ? ` par ${c.grantedBy}` : ''}
            </p>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-brand-50"
            role="progressbar"
            aria-label="Part du plafond utilisée"
            aria-valuenow={Math.round(ratio * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={c.daysLate > 0 ? 'h-full bg-warning' : 'h-full bg-brand-600'}
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink">
            <span>
              Disponible : <strong>{formatFCFA(c.available)}</strong>
            </span>
            <span>
              À verser pour être à jour : <strong>{formatFCFA(c.dueToday)}</strong>
            </span>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Achats à crédit"
            description="Un remboursement règle d’abord la dette la plus ancienne."
          />
          {c.debts.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              Aucun achat à crédit pour l’instant.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {c.debts.map((d) => (
                <li key={d.id} className="flex flex-col gap-1 px-5 py-3.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/commandes/${d.orderId}`}
                      className="font-semibold text-ink hover:underline"
                    >
                      Commande {d.orderNumber}
                    </Link>
                    <Badge
                      tone={d.status === 'open' ? (d.daysLate > 0 ? 'warning' : 'info') : 'neutral'}
                    >
                      {d.status === 'open' && d.daysLate > 0
                        ? `${d.daysLate} j de retard`
                        : DEBT_LABELS[d.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted tabular-nums">
                    {formatFCFA(d.paid)} remboursés sur {formatFCFA(d.amount)} ·{' '}
                    {formatFCFA(d.dailyAmount)} / jour · achat le{' '}
                    {dateFmt.format(new Date(d.startedAt))} · échéance le{' '}
                    {dateFmt.format(new Date(d.dueAt))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Remboursements" description="Le plus récent d’abord." />
            {c.repayments.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">
                Aucun remboursement pour l’instant.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {c.repayments.map((x) => (
                  <li key={x.id} className="flex items-start gap-3 px-5 py-3.5 text-sm">
                    {x.status === 'succeeded' ? (
                      <CheckCircle2
                        className="mt-0.5 size-4 shrink-0 text-brand-600"
                        aria-label="Reçu"
                      />
                    ) : x.status === 'pending' ? (
                      <Clock className="mt-0.5 size-4 shrink-0 text-info" aria-label="En attente" />
                    ) : (
                      <XCircle
                        className="mt-0.5 size-4 shrink-0 text-danger"
                        aria-label="Non abouti"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink tabular-nums">{formatFCFA(x.amount)}</p>
                      <p className="text-xs text-muted">
                        {REPAYMENT_METHOD_LABELS[x.method]}
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
          {c.requests.length > 0 ? (
            <Card>
              <CardHeader title="Demandes de crédit" />
              <ul className="divide-y divide-line">
                {c.requests.map((r) => (
                  <li key={r.id} className="flex flex-col gap-0.5 px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink tabular-nums">
                        {formatFCFA(r.amount)}
                      </span>
                      <Badge
                        tone={
                          r.status === 'approved'
                            ? 'success'
                            : r.status === 'rejected'
                              ? 'danger'
                              : 'accent'
                        }
                      >
                        {REQUEST_LABELS[r.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted">{formatDateTime(r.createdAt)}</p>
                    {r.message ? <p className="text-xs text-muted">« {r.message} »</p> : null}
                    {r.reason ? <p className="text-xs text-danger">Motif : {r.reason}</p> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
