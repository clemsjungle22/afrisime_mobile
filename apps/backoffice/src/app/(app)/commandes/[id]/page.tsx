import { AdminOrderDetail } from '@afrisime/shared';
import { ArrowLeft, MapPin, Phone, Printer, Store, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { ApiError, api } from '@/lib/api';
import {
  PAYMENT_SHORT,
  PAYMENT_STATUS_LABELS,
  STATUS_TONES,
  formatPhone,
  formatSlot,
} from '@/lib/orders';
import { ORDER_STATUS_LABELS, cn, formatDateTime, formatFCFA } from '@/lib/utils';
import { NoteForm, OrderActions } from './order-actions';

export const metadata: Metadata = { title: 'Commande' };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ roles: ['admin', 'orders', 'support', 'readonly'] });
  const { id } = await params;
  let o: AdminOrderDetail;
  try {
    o = await api(`/v1/admin/orders/${encodeURIComponent(id)}`, { schema: AdminOrderDetail });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const slot = formatSlot(o.slot);
  const canNote = o.allowedActions.includes('add_note');
  const mapsUrl = o.address?.location
    ? `https://www.google.com/maps/search/?api=1&query=${o.address.location.latitude},${o.address.location.longitude}`
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/commandes"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden /> Commandes
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink">{o.orderNumber}</h1>
            <Badge tone={STATUS_TONES[o.status]} className="text-sm">
              {ORDER_STATUS_LABELS[o.status]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted">Passée le {formatDateTime(o.createdAt)}</p>
        </div>
        <Link
          href={`/commandes/${o.id}/bon`}
          target="_blank"
          className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-brand-50"
        >
          <Printer className="size-4" aria-hidden /> Bon de préparation
        </Link>
      </div>

      {o.amountDue > 0 ? (
        <Alert tone="warning">
          <strong>{formatFCFA(o.amountDue)} à encaisser</strong> à la remise (
          {PAYMENT_SHORT[o.paymentMethod].toLowerCase()}).
        </Alert>
      ) : null}
      {o.paymentDeadline ? (
        <Alert tone="info">
          En attente du paiement en ligne du client, au plus tard le{' '}
          {formatDateTime(o.paymentDeadline)}. Sinon, la commande sera annulée automatiquement.
        </Alert>
      ) : null}

      <OrderActions
        orderId={o.id}
        status={o.status}
        actions={o.allowedActions}
        amountDue={o.amountDue}
      />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader
              title="Articles"
              description={`${o.itemCount} article${o.itemCount > 1 ? 's' : ''}`}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold tracking-wide text-muted uppercase">
                    <th scope="col" className="px-5 py-2.5">
                      Produit
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right">
                      Prix
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right">
                      Qté
                    </th>
                    <th scope="col" className="px-5 py-2.5 text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {o.lines.map((l) => (
                    <tr key={l.variantId}>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-ink">{l.productName}</p>
                        <p className="text-xs text-muted">
                          {l.brand} · {l.variantLabel}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {l.unitPrice !== null ? formatFCFA(l.unitPrice) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums">{l.quantity}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">
                        {formatFCFA(l.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-line text-sm">
                  <Total label="Sous-total" value={o.subtotal} />
                  <Total
                    label={o.fulfillment === 'delivery' ? 'Livraison' : 'Retrait'}
                    value={o.deliveryFee}
                    freeLabel={o.fulfillment === 'delivery' ? 'Offerte' : 'Gratuit'}
                  />
                  {o.discountTotal > 0 ? <Total label="Remise" value={-o.discountTotal} /> : null}
                  {o.deliveryBonus > 0 ? (
                    <Total label="Bonus Mobile Money (livraison)" value={-o.deliveryBonus} />
                  ) : null}
                  {o.storeCreditUsed > 0 ? <Total label="Avoir utilisé" value={-o.storeCreditUsed} /> : null}
                  <Total label="Total" value={o.total} strong />
                </tfoot>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Suivi"
              description="Chaque étape est visible par le client, avec son message."
            />
            <ol className="flex flex-col gap-4 px-5 py-4">
              {o.history.map((h, i) => (
                <li key={`${h.status}-${h.at}-${i}`} className="flex gap-3">
                  <span
                    className={cn(
                      'mt-1.5 size-2.5 shrink-0 rounded-full',
                      i === o.history.length - 1
                        ? 'bg-accent-500 ring-4 ring-accent-100'
                        : 'bg-brand-200',
                    )}
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {ORDER_STATUS_LABELS[h.status]}{' '}
                      <span className="font-normal text-muted">· {h.actor}</span>
                    </p>
                    {h.note ? <p className="text-sm text-muted">{h.note}</p> : null}
                    <p className="text-xs text-muted/80">{formatDateTime(h.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Client" />
            <div className="flex flex-col gap-2 px-5 py-4 text-sm">
              <Link
                href={`/clients/${o.customer.id}`}
                className="w-fit font-bold text-ink hover:text-brand-700 hover:underline"
              >
                {o.customer.name ?? 'Client sans nom'}
              </Link>
              <a
                href={`tel:${o.customer.phone}`}
                className="inline-flex w-fit items-center gap-2 font-semibold text-brand-700 hover:underline"
              >
                <Phone className="size-4" aria-hidden /> {formatPhone(o.customer.phone)}
              </a>
              {o.customer.email ? <p className="text-muted">{o.customer.email}</p> : null}
              <Badge
                tone={o.customer.segmentLabel === 'Professionnel' ? 'accent' : 'neutral'}
                className="w-fit"
              >
                {o.customer.segmentLabel}
              </Badge>
            </div>
          </Card>

          <Card>
            <CardHeader title={o.fulfillment === 'delivery' ? 'Livraison' : 'Retrait en agence'} />
            <div className="flex flex-col gap-3 px-5 py-4 text-sm">
              <Info
                icon={
                  o.fulfillment === 'delivery' ? (
                    <Truck className="size-4" />
                  ) : (
                    <Store className="size-4" />
                  )
                }
                label="Créneau"
              >
                <span className={cn(slot.today && 'font-bold text-accent-600')}>{slot.label}</span>
              </Info>
              {o.address ? (
                <Info
                  icon={<MapPin className="size-4" />}
                  label={o.address.zoneName ?? 'Hors zone'}
                >
                  <p className="font-semibold text-ink">
                    {o.address.recipientName} · {formatPhone(o.address.phone)}
                  </p>
                  <p>
                    {o.address.district}, {o.address.city}
                  </p>
                  <p className="text-ink">Repère : {o.address.landmark}</p>
                  {o.address.instructions ? (
                    <p className="text-muted">« {o.address.instructions} »</p>
                  ) : null}
                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block font-semibold text-brand-700 hover:underline"
                    >
                      Ouvrir dans Google Maps
                    </a>
                  ) : null}
                </Info>
              ) : null}
              {o.agency ? (
                <Info icon={<Store className="size-4" />} label="Agence">
                  <p className="font-semibold text-ink">{o.agency.name}</p>
                  <p>{o.agency.address}</p>
                  {o.fulfillment === 'pickup' ? (
                    <p className="text-muted">
                      Le client présente un code à 6 chiffres au retrait.
                    </p>
                  ) : null}
                </Info>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Paiement" />
            <div className="flex flex-col gap-3 px-5 py-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-ink">{PAYMENT_SHORT[o.paymentMethod]}</span>
                <Badge tone={PAYMENT_STATUS_LABELS[o.paymentStatus].tone}>
                  {PAYMENT_STATUS_LABELS[o.paymentStatus].label}
                </Badge>
              </div>
              {o.paidAt ? <p className="text-muted">Payé le {formatDateTime(o.paidAt)}</p> : null}
              {o.payments.length > 0 ? (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {o.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div>
                        <p className="font-semibold text-ink">
                          {p.provider === 'manual'
                            ? 'Encaissé par l’équipe'
                            : PAYMENT_SHORT[p.method]}{' '}
                          · {formatFCFA(p.amount)}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDateTime(p.createdAt)}
                          {p.phone ? ` · ${formatPhone(p.phone)}` : ''}
                          {p.failureReason ? ` · ${p.failureReason}` : ''}
                        </p>
                      </div>
                      <Badge tone={PAYMENT_STATUS_LABELS[p.status].tone}>
                        {PAYMENT_STATUS_LABELS[p.status].label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Notes internes" description="Jamais visibles par le client." />
            <div className="flex flex-col gap-3 px-5 py-4">
              {o.notes.length === 0 ? <p className="text-sm text-muted">Aucune note.</p> : null}
              {o.notes.map((n) => (
                <div key={n.id} className="rounded-xl bg-cream px-3.5 py-2.5 text-sm">
                  <p className="whitespace-pre-line text-ink">{n.text}</p>
                  <p className="mt-1 text-xs text-muted">
                    {n.author} · {formatDateTime(n.at)}
                  </p>
                </div>
              ))}
              {canNote ? <NoteForm orderId={o.id} /> : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Total({
  label,
  value,
  strong,
  freeLabel,
}: {
  label: string;
  value: number;
  strong?: boolean;
  /** Libellé quand le montant est nul (livraison offerte, retrait gratuit). */
  freeLabel?: string;
}) {
  return (
    <tr>
      <td
        colSpan={3}
        className={cn('px-5 py-1.5 text-right text-muted', strong && 'pt-3 font-bold text-ink')}
      >
        {label}
      </td>
      <td
        className={cn(
          'px-5 py-1.5 text-right tabular-nums',
          strong && 'pt-3 text-base font-extrabold text-ink',
        )}
      >
        {freeLabel && value === 0 ? freeLabel : formatFCFA(value)}
      </td>
    </tr>
  );
}

function Info({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-muted" aria-hidden>
        {icon}
      </span>
      <div className="flex flex-col gap-0.5 text-muted">
        <span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
        {children}
      </div>
    </div>
  );
}
