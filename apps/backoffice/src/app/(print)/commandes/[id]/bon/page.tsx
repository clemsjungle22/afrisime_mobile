import { AdminOrderDetail } from '@afrisime/shared';
import type { Metadata } from 'next';
import Image from 'next/image';
import { requireAdmin } from '@/lib/admin';
import { api } from '@/lib/api';
import { PAYMENT_SHORT, formatPhone, formatSlot } from '@/lib/orders';
import { formatDateTime, formatFCFA } from '@/lib/utils';
import { PrintButton } from './print-button';

export const metadata: Metadata = { title: 'Bon de préparation' };

/** Bon de préparation A4 : à imprimer et à joindre au colis. */
export default async function PickingSlip({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin({ roles: ['admin', 'orders', 'support', 'readonly'] });
  const { id } = await params;
  const o = await api(`/v1/admin/orders/${encodeURIComponent(id)}`, { schema: AdminOrderDetail });
  const slot = formatSlot(o.slot);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-10 text-[13px] text-black print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <header className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <Image src="/logo.webp" alt="AfriSime" width={150} height={39} priority />
          <p className="mt-2 text-xs tracking-widest uppercase">Bon de préparation</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold">{o.orderNumber}</p>
          <p>Passée le {formatDateTime(o.createdAt)}</p>
          <p className="mt-1 text-base font-bold">{slot.label}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 border-b border-black/30 py-4">
        <div>
          <p className="text-xs font-bold tracking-wide uppercase">Client</p>
          <p className="mt-1 text-base font-bold">{o.customer.name ?? 'Client sans nom'}</p>
          <p>{formatPhone(o.customer.phone)}</p>
        </div>
        <div>
          <p className="text-xs font-bold tracking-wide uppercase">
            {o.fulfillment === 'delivery' ? 'Livraison' : 'Retrait en agence'}
          </p>
          {o.address ? (
            <>
              <p className="mt-1 font-bold">
                {o.address.recipientName} · {formatPhone(o.address.phone)}
              </p>
              <p>
                {o.address.district}, {o.address.city}{' '}
                {o.address.zoneName ? `(${o.address.zoneName})` : ''}
              </p>
              <p className="font-semibold">Repère : {o.address.landmark}</p>
              {o.address.instructions ? <p>« {o.address.instructions} »</p> : null}
            </>
          ) : null}
          {o.agency && o.fulfillment === 'pickup' ? (
            <>
              <p className="mt-1 font-bold">Agence {o.agency.name}</p>
              <p>{o.agency.address}</p>
              <p>Remettre uniquement sur présentation du code de retrait.</p>
            </>
          ) : null}
        </div>
      </section>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-black text-left text-xs uppercase">
            <th scope="col" className="w-10 py-2">
              Prêt
            </th>
            <th scope="col" className="py-2">
              Produit
            </th>
            <th scope="col" className="py-2">
              Format
            </th>
            <th scope="col" className="py-2 text-right">
              Qté
            </th>
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l) => (
            <tr key={l.variantId} className="border-b border-black/20">
              <td className="py-3">
                <span className="inline-block size-5 border-2 border-black" aria-hidden />
              </td>
              <td className="py-3">
                <p className="text-sm font-bold">{l.productName}</p>
                <p className="text-xs">{l.brand}</p>
              </td>
              <td className="py-3">{l.variantLabel}</td>
              <td className="py-3 text-right text-lg font-extrabold">{l.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-6 flex items-start justify-between gap-6">
        <div className="text-xs">
          <p>Paiement : {PAYMENT_SHORT[o.paymentMethod]}</p>
          <p className="mt-6">Préparé par : ______________________</p>
          <p className="mt-4">Contrôlé par : _____________________</p>
        </div>
        <div className="min-w-56 rounded border-2 border-black p-3 text-right">
          <p className="text-xs uppercase">
            {o.amountDue > 0 ? 'À encaisser à la remise' : 'Déjà payé'}
          </p>
          <p className="text-2xl font-extrabold">
            {formatFCFA(o.amountDue > 0 ? o.amountDue : o.total)}
          </p>
        </div>
      </section>
    </div>
  );
}
