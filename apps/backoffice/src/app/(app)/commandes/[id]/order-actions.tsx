'use client';

import type { AdminOrderAction, OrderStatus } from '@afrisime/shared';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { ACTION_COPY, ACTION_ORDER } from '@/lib/orders';
import { formatFCFA } from '@/lib/utils';
import { type ActionState, noteAction, orderAction } from './actions';

type Props = {
  orderId: string;
  status: OrderStatus;
  actions: AdminOrderAction[];
  amountDue: number;
};

const NEXT_STEPS = new Set<AdminOrderAction>([
  'start_preparing',
  'mark_ready',
  'dispatch',
  'mark_delivered',
  'complete_pickup',
]);

/** Boutons d'action de la fiche : l'étape suivante en évidence, les actions exceptionnelles en retrait. */
export function OrderActions({ orderId, status, actions, amountDue }: Props) {
  const visible = ACTION_ORDER.filter((a) => actions.includes(a)) as Exclude<
    AdminOrderAction,
    'add_note'
  >[];
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((action) => (
        <ActionDialog
          key={`${action}-${status}`}
          orderId={orderId}
          status={status}
          action={action}
          amountDue={amountDue}
          variant={
            action === 'cancel'
              ? 'danger-ghost'
              : action === 'collect_payment'
                ? 'accent'
                : NEXT_STEPS.has(action) &&
                    !(
                      amountDue > 0 &&
                      (action === 'mark_delivered' || action === 'complete_pickup')
                    )
                  ? 'primary'
                  : 'secondary'
          }
        />
      ))}
    </div>
  );
}

function ActionDialog({
  orderId,
  status,
  action,
  amountDue,
  variant,
}: {
  orderId: string;
  status: OrderStatus;
  action: Exclude<AdminOrderAction, 'add_note'>;
  amountDue: number;
  variant: 'primary' | 'secondary' | 'accent' | 'danger-ghost';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    orderAction.bind(null, orderId, action, status),
    {},
  );
  const [openedAt, setOpenedAt] = useState(0);
  const copy = ACTION_COPY[action];

  useEffect(() => {
    if (state.ok) ref.current?.close();
  }, [state]);

  const open = () => {
    setOpenedAt(Date.now());
    ref.current?.showModal();
  };

  return (
    <>
      <Button
        type="button"
        onClick={open}
        variant={variant === 'danger-ghost' ? 'ghost' : variant}
        className={
          variant === 'danger-ghost'
            ? 'text-danger hover:bg-danger-50 hover:text-danger'
            : undefined
        }
      >
        {action === 'collect_payment' ? `${copy.label} ${formatFCFA(amountDue)}` : copy.label}
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={`dlg-${action}`}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-brand-950/40"
      >
        <form action={formAction} className="flex flex-col gap-4 p-6" key={openedAt}>
          <div>
            <h2 id={`dlg-${action}`} className="text-lg font-extrabold">
              {copy.title}
            </h2>
            <p className="mt-1 text-sm text-muted">{copy.description}</p>
          </div>
          {state.error && !state.ok ? <Alert tone="danger">{state.error}</Alert> : null}

          {action === 'collect_payment' ? (
            <TextField
              name="amount"
              label="Montant reçu (FCFA)"
              defaultValue={String(amountDue)}
              inputMode="numeric"
              required
            />
          ) : action === 'cancel' ? (
            <TextArea
              name="reason"
              label="Motif (visible par le client)"
              required
              placeholder="Ex. : rupture chez le fournisseur"
            />
          ) : action === 'complete_pickup' ? (
            <TextField
              name="pickupCode"
              label="Code de retrait du client"
              inputMode="numeric"
              required
              placeholder="123456"
              autoComplete="off"
            />
          ) : action === 'delivery_failed' ? (
            <TextArea
              name="note"
              label="Motif (visible par le client)"
              required
              placeholder="Ex. : client absent, adresse introuvable"
            />
          ) : (
            <TextArea
              name="note"
              label="Message pour le client (facultatif)"
              placeholder={action === 'dispatch' ? 'Ex. : Livreur : Koffi, 90 11 22 33' : ''}
            />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => ref.current?.close()}>
              Fermer
            </Button>
            <Button
              type="submit"
              loading={pending}
              variant={action === 'cancel' ? 'danger' : 'primary'}
            >
              {action === 'cancel' ? 'Annuler la commande' : 'Confirmer'}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function TextField(props: {
  name: string;
  label: string;
  defaultValue?: string;
  inputMode?: 'numeric';
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  const { label, ...input } = props;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <input
        {...input}
        autoFocus
        className="h-11 rounded-xl border border-line px-3.5 text-[15px] focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
      />
    </label>
  );
}

function TextArea({
  name,
  label,
  required,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <textarea
        name={name}
        required={required}
        placeholder={placeholder}
        rows={3}
        maxLength={300}
        autoFocus
        className="rounded-xl border border-line px-3.5 py-2.5 text-[15px] focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
      />
    </label>
  );
}

/** Ajout d'une note interne. */
export function NoteForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    noteAction.bind(null, orderId),
    {},
  );
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <label className="sr-only" htmlFor="note-text">
        Note interne
      </label>
      <textarea
        id="note-text"
        name="text"
        rows={2}
        maxLength={1000}
        placeholder="Note pour l’équipe (jamais visible par le client)"
        className="rounded-xl border border-line px-3.5 py-2.5 text-sm focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="secondary" loading={pending}>
          Ajouter la note
        </Button>
      </div>
    </form>
  );
}
