'use client';

import { Banknote } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/form';
import { formatFCFA } from '@/lib/utils';
import { cashAction } from '../../actions';

/** Cotisation reçue en espèces au comptoir : enregistrée et visible tout de suite par le client. */
export function CashButton({
  carnetId,
  dailyAmount,
  remaining,
  agencies,
}: {
  carnetId: string;
  dailyAmount: number;
  remaining: number;
  agencies: { id: string; name: string }[];
}) {
  return (
    <Dialog
      title="Encaisser une cotisation en espèces"
      description="Le montant est ajouté au carnet tout de suite ; le client le voit dans son app."
      trigger={(open) => (
        <Button variant="accent" onClick={open}>
          <Banknote className="size-4" aria-hidden /> Encaisser des espèces
        </Button>
      )}
    >
      {(close) => (
        <CashForm
          carnetId={carnetId}
          suggested={Math.min(dailyAmount, remaining)}
          remaining={remaining}
          agencies={agencies}
          onDone={close}
        />
      )}
    </Dialog>
  );
}

function CashForm({
  carnetId,
  suggested,
  remaining,
  agencies,
  onDone,
}: {
  carnetId: string;
  suggested: number;
  remaining: number;
  agencies: { id: string; name: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Math.round(Number(String(fd.get('amount') ?? '').replace(/\s/g, '')) || 0);
    start(async () => {
      const res = await cashAction(carnetId, {
        amount,
        agencyId: String(fd.get('agencyId') ?? ''),
        note: String(fd.get('note') ?? '').trim() || undefined,
      });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextInput
        name="amount"
        label="Montant reçu"
        type="number"
        min={1}
        max={remaining}
        suffix="FCFA"
        required
        defaultValue={suggested}
        hint={`Reste à verser : ${formatFCFA(remaining)}.`}
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
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" loading={pending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
