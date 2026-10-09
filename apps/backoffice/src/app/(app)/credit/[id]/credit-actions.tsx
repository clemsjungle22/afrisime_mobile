'use client';

import type { AdminCreditDetail } from '@afrisime/shared';
import { Ban, Banknote, BadgeCheck, Pencil, RotateCcw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextArea, TextInput } from '@/components/ui/form';
import { formatFCFA } from '@/lib/utils';
import {
  type Result,
  creditCashAction,
  grantAction,
  rejectAction,
  suspendAction,
} from '../actions';

type Agency = { id: string; name: string };

/** Change à chaque intervention enregistrée sur le crédit. */
const versionOf = (c: AdminCreditDetail) =>
  [
    c.status,
    c.limit,
    c.termDays,
    c.used,
    c.repayments.length,
    c.requests.length,
    c.pendingRequest?.id ?? '',
  ].join(':');

/**
 * Envoi d'une action : la fenêtre reste ouverte, bouton « en cours », jusqu'à ce que la fiche affiche
 * le nouvel état (repéré par `version`) : jamais de fenêtre fermée sur une page périmée.
 */
function useSubmit(close: () => void, version: string) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentFrom, setSentFrom] = useState<string | null>(null);

  useEffect(() => {
    if (sentFrom !== null && version !== sentFrom) close();
  }, [version, sentFrom, close]);

  const submit = (call: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const res = await call();
      if (!res.ok) return setError(res.error);
      setSentFrom(version);
      router.refresh();
    });
  return { pending: pending || sentFrom !== null, error, submit };
}

const amountOf = (v: FormDataEntryValue | null) =>
  Math.round(Number(String(v ?? '').replace(/\s/g, '')) || 0);

export function CreditActions({
  detail: c,
  agencies,
}: {
  detail: AdminCreditDetail;
  agencies: Agency[];
}) {
  const canGrant = c.canManage && (c.status !== 'none' || c.isProValidated);
  return (
    <div className="flex flex-wrap gap-2">
      {c.canRecordCash && agencies.length > 0 ? (
        <CashDialog detail={c} agencies={agencies} />
      ) : null}
      {canGrant ? <GrantDialog detail={c} /> : null}
      {c.canManage && c.pendingRequest ? <RejectDialog detail={c} /> : null}
      {c.canManage && c.status !== 'none' ? <SuspendDialog detail={c} /> : null}
    </div>
  );
}

function Actions({
  onCancel,
  pending,
  children,
}: {
  onCancel: () => void;
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Annuler
      </Button>
      <Button type="submit" loading={pending}>
        {children}
      </Button>
    </div>
  );
}

function GrantDialog({ detail: c }: { detail: AdminCreditDetail }) {
  const first = c.status === 'none';
  return (
    <Dialog
      title={first ? 'Accorder un crédit' : 'Modifier le crédit'}
      description={
        first
          ? 'Plafond : montant maximum des achats à crédit non remboursés. Durée : nombre de jours pour rembourser chaque achat.'
          : 'Le nouveau plafond s’applique tout de suite ; la nouvelle durée vaut pour les prochains achats.'
      }
      trigger={(open) => (
        <Button variant={first ? 'primary' : 'secondary'} onClick={open}>
          {first ? (
            <BadgeCheck className="size-4" aria-hidden />
          ) : (
            <Pencil className="size-4" aria-hidden />
          )}
          {first ? 'Accorder le crédit' : 'Modifier'}
        </Button>
      )}
    >
      {(close) => <GrantForm detail={c} close={close} />}
    </Dialog>
  );
}

function GrantForm({ detail: c, close }: { detail: AdminCreditDetail; close: () => void }) {
  const { pending, error, submit } = useSubmit(close, versionOf(c));
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    submit(() =>
      grantAction(c.customer.id, {
        limit: amountOf(fd.get('limit')),
        termDays: amountOf(fd.get('termDays')),
      }),
    );
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextInput
        name="limit"
        label="Plafond"
        type="number"
        min={1000}
        step={500}
        suffix="FCFA"
        required
        defaultValue={c.status === 'none' ? (c.pendingRequest?.amount ?? 50_000) : c.limit}
        hint={
          c.pendingRequest ? `Montant demandé : ${formatFCFA(c.pendingRequest.amount)}.` : undefined
        }
      />
      <TextInput
        name="termDays"
        label="Durée de remboursement"
        type="number"
        min={1}
        max={365}
        suffix="jours"
        required
        defaultValue={c.status === 'none' ? 30 : c.termDays}
        hint="Exemple : 30 jours pour un achat de 30 000 F = 1 000 F par jour, à partir du lendemain."
      />
      <Actions onCancel={close} pending={pending}>
        {c.status === 'none' ? 'Accorder' : 'Enregistrer'}
      </Actions>
    </form>
  );
}

function RejectDialog({ detail: c }: { detail: AdminCreditDetail }) {
  return (
    <Dialog
      title="Refuser la demande"
      description="La cliente voit le motif dans son app et pourra refaire une demande plus tard."
      trigger={(open) => (
        <Button variant="ghost" onClick={open}>
          <X className="size-4" aria-hidden /> Refuser
        </Button>
      )}
    >
      {(close) => <RejectForm detail={c} close={close} />}
    </Dialog>
  );
}

function RejectForm({ detail: c, close }: { detail: AdminCreditDetail; close: () => void }) {
  const { pending, error, submit } = useSubmit(close, versionOf(c));
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    submit(() => rejectAction(c.customer.id, { reason }));
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextArea
        name="reason"
        label="Motif (visible par la cliente)"
        required
        minLength={3}
        maxLength={300}
      />
      <Actions onCancel={close} pending={pending}>
        Refuser la demande
      </Actions>
    </form>
  );
}

function SuspendDialog({ detail: c }: { detail: AdminCreditDetail }) {
  const suspended = c.status === 'suspended';
  return (
    <Dialog
      title={suspended ? 'Rétablir le crédit' : 'Suspendre le crédit'}
      description={
        suspended
          ? 'La cliente pourra de nouveau acheter à crédit (si elle n’est pas en retard).'
          : 'La cliente ne pourra plus acheter à crédit ; elle peut continuer à rembourser.'
      }
      trigger={(open) => (
        <Button variant="ghost" onClick={open}>
          {suspended ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : (
            <Ban className="size-4" aria-hidden />
          )}
          {suspended ? 'Rétablir' : 'Suspendre'}
        </Button>
      )}
    >
      {(close) => <SuspendForm detail={c} close={close} />}
    </Dialog>
  );
}

function SuspendForm({ detail: c, close }: { detail: AdminCreditDetail; close: () => void }) {
  const suspended = c.status === 'suspended';
  const { pending, error, submit } = useSubmit(close, versionOf(c));
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    submit(() =>
      suspendAction(c.customer.id, { suspended: !suspended, reason: reason || undefined }),
    );
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {suspended ? null : <TextArea name="reason" label="Motif (facultatif)" maxLength={300} />}
      <Actions onCancel={close} pending={pending}>
        {suspended ? 'Rétablir' : 'Suspendre'}
      </Actions>
    </form>
  );
}

function CashDialog({ detail: c, agencies }: { detail: AdminCreditDetail; agencies: Agency[] }) {
  return (
    <Dialog
      title="Encaisser un remboursement en espèces"
      description="Le montant règle d’abord l’achat le plus ancien ; la cliente le voit tout de suite dans son app."
      trigger={(open) => (
        <Button variant="accent" onClick={open}>
          <Banknote className="size-4" aria-hidden /> Encaisser des espèces
        </Button>
      )}
    >
      {(close) => <CashForm detail={c} agencies={agencies} close={close} />}
    </Dialog>
  );
}

function CashForm({
  detail: c,
  agencies,
  close,
}: {
  detail: AdminCreditDetail;
  agencies: Agency[];
  close: () => void;
}) {
  const { pending, error, submit } = useSubmit(close, versionOf(c));
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    submit(() =>
      creditCashAction(c.customer.id, {
        amount: amountOf(fd.get('amount')),
        agencyId: String(fd.get('agencyId') ?? ''),
        note: String(fd.get('note') ?? '').trim() || undefined,
      }),
    );
  };
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextInput
        name="amount"
        label="Montant reçu"
        type="number"
        min={1}
        max={c.used}
        suffix="FCFA"
        required
        defaultValue={c.dueToday > 0 ? c.dueToday : Math.min(c.used, 1000)}
        hint={`À verser pour être à jour : ${formatFCFA(c.dueToday)} · reste à rembourser : ${formatFCFA(c.used)}.`}
      />
      <SelectInput
        name="agencyId"
        label="Agence"
        options={agencies.map((a) => [a.id, a.name] as const)}
      />
      <TextInput
        name="note"
        label="Référence du reçu (facultatif)"
        maxLength={200}
        placeholder="Reçu n°…"
      />
      <Actions onCancel={close} pending={pending}>
        Enregistrer
      </Actions>
    </form>
  );
}
