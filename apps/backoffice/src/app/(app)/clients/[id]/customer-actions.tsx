'use client';

import {
  type AdminCustomerDetail,
  PRICE_SEGMENT_LABELS,
  type PriceSegment,
} from '@afrisime/shared';
import { BadgeCheck, Ban, LockOpen, Tags, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextArea } from '@/components/ui/form';
import { type Result, blockAction, pricingAction, reviewProAction } from './actions';

/** Boutons de la fiche client, selon ce que le serveur autorise pour ce compte et ce rôle. */
export function CustomerActions({ customer: c }: { customer: AdminCustomerDetail }) {
  const can = (a: AdminCustomerDetail['allowedActions'][number]) => c.allowedActions.includes(a);
  if (c.allowedActions.length === 0) return null;
  const typeLabel = c.customerType?.label ?? 'pro';
  return (
    <div className="flex flex-wrap gap-2">
      {can('review_pro') ? (
        <>
          <ConfirmDialog
            title={`Valider le profil « ${typeLabel} » ?`}
            description="Le client passe au tarif pro tout de suite : il verra les prix pros dans l’app."
            trigger={
              <>
                <BadgeCheck className="size-4" aria-hidden /> Valider le profil pro
              </>
            }
            submitLabel="Valider"
            onSubmit={() => reviewProAction(c.id, { decision: 'approve' })}
          />
          <ConfirmDialog
            title="Refuser le profil pro ?"
            description="Le client repasse au profil particulier, avec le tarif normal. Il pourra refaire une demande depuis l’app."
            variant="secondary"
            trigger={
              <>
                <X className="size-4" aria-hidden /> Refuser
              </>
            }
            submitLabel="Refuser la demande"
            reasonLabel="Motif du refus"
            reasonHint="Gardé dans l’historique du compte (non montré au client)."
            onSubmit={(reason) => reviewProAction(c.id, { decision: 'reject', reason })}
          />
        </>
      ) : null}
      {can('change_pricing') ? <PricingDialog customer={c} /> : null}
      {can('block') ? (
        <ConfirmDialog
          title="Bloquer ce compte ?"
          description="Le client est déconnecté tout de suite sur tous ses téléphones et ne peut plus se reconnecter. Ses commandes en cours ne sont pas annulées : traitez-les au cas par cas."
          variant="danger-ghost"
          trigger={
            <>
              <Ban className="size-4" aria-hidden /> Bloquer le compte
            </>
          }
          submitLabel="Bloquer"
          submitVariant="danger"
          reasonLabel="Motif du blocage"
          onSubmit={(reason) => blockAction(c.id, true, reason)}
        />
      ) : null}
      {can('unblock') ? (
        <ConfirmDialog
          title="Débloquer ce compte ?"
          description="Le client pourra de nouveau se connecter à l’app avec son numéro."
          trigger={
            <>
              <LockOpen className="size-4" aria-hidden /> Débloquer le compte
            </>
          }
          submitLabel="Débloquer"
          reasonLabel="Motif du déblocage"
          onSubmit={(reason) => blockAction(c.id, false, reason)}
        />
      ) : null}
    </div>
  );
}

function useSubmit(close: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const submit = (call: () => Promise<Result>) =>
    start(async () => {
      const res = await call();
      if (!res.ok) return setError(res.error);
      router.refresh();
      close();
    });
  return { pending, error, submit };
}

const TRIGGER_VARIANTS = {
  primary: 'primary',
  secondary: 'secondary',
  'danger-ghost': 'ghost',
} as const;

function ConfirmDialog({
  title,
  description,
  trigger,
  submitLabel,
  onSubmit,
  variant = 'primary',
  submitVariant = 'primary',
  reasonLabel,
  reasonHint,
}: {
  title: string;
  description: string;
  trigger: ReactNode;
  submitLabel: string;
  onSubmit: (reason: string) => Promise<Result>;
  variant?: keyof typeof TRIGGER_VARIANTS;
  submitVariant?: 'primary' | 'danger';
  /** Motif obligatoire (3 caractères minimum). */
  reasonLabel?: string;
  reasonHint?: string;
}) {
  return (
    <Dialog
      title={title}
      description={description}
      trigger={(open) => (
        <Button
          variant={TRIGGER_VARIANTS[variant]}
          onClick={open}
          className={
            variant === 'danger-ghost' ? 'text-danger hover:bg-danger-50 hover:text-danger' : ''
          }
        >
          {trigger}
        </Button>
      )}
    >
      {(close) => (
        <ConfirmForm
          close={close}
          submitLabel={submitLabel}
          submitVariant={submitVariant}
          reasonLabel={reasonLabel}
          reasonHint={reasonHint}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  );
}

function ConfirmForm({
  close,
  submitLabel,
  submitVariant,
  reasonLabel,
  reasonHint,
  onSubmit,
}: {
  close: () => void;
  submitLabel: string;
  submitVariant: 'primary' | 'danger';
  reasonLabel?: string;
  reasonHint?: string;
  onSubmit: (reason: string) => Promise<Result>;
}) {
  const { pending, error, submit } = useSubmit(close);
  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    submit(() => onSubmit(reason));
  };
  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {reasonLabel ? (
        <TextArea
          name="reason"
          label={reasonLabel}
          hint={reasonHint ?? 'Gardé dans l’historique du compte.'}
          required
          minLength={3}
          maxLength={300}
        />
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Annuler
        </Button>
        <Button type="submit" variant={submitVariant} loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function PricingDialog({ customer: c }: { customer: AdminCustomerDetail }) {
  return (
    <Dialog
      title="Changer le profil ou le tarif"
      description="Pour un cas particulier (grossiste connu, erreur de profil…). Le changement s’applique tout de suite dans l’app."
      trigger={(open) => (
        <Button variant="secondary" onClick={open}>
          <Tags className="size-4" aria-hidden /> Changer le profil ou le tarif
        </Button>
      )}
    >
      {(close) => <PricingForm customer={c} close={close} />}
    </Dialog>
  );
}

function PricingForm({ customer: c, close }: { customer: AdminCustomerDetail; close: () => void }) {
  const { pending, error, submit } = useSubmit(close);
  const [typeId, setTypeId] = useState(c.customerType?.id ?? c.customerTypes[0]?.id ?? '');
  const [segment, setSegment] = useState<PriceSegment>(c.segment);
  const send = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim();
    submit(() => pricingAction(c.id, { customerTypeId: typeId, segment, reason }));
  };
  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <SelectInput
        name="customerTypeId"
        label="Profil"
        options={c.customerTypes.map((t) => [t.id, t.label] as const)}
        value={typeId}
        onChange={(e) => {
          setTypeId(e.target.value);
          // Tarif proposé par défaut : celui du profil choisi (modifiable).
          const t = c.customerTypes.find((x) => x.id === e.target.value);
          if (t) setSegment(t.segment);
        }}
      />
      <SelectInput
        name="segment"
        label="Tarif appliqué"
        options={Object.entries(PRICE_SEGMENT_LABELS)}
        value={segment}
        onChange={(e) => setSegment(e.target.value as PriceSegment)}
      />
      <TextArea
        name="reason"
        label="Motif"
        hint="Gardé dans l’historique du compte."
        required
        minLength={3}
        maxLength={300}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={close}>
          Annuler
        </Button>
        <Button type="submit" loading={pending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
