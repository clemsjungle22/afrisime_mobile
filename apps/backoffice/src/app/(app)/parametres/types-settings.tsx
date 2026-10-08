'use client';

import { type AdminCustomerType, PRICE_SEGMENT_LABELS, type PriceSegment } from '@afrisime/shared';
import { Pencil, Plus } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { moveTypeAction, saveTypeAction } from './actions';
import { MoveButtons, useRun } from './settings-ui';

export function TypesSettings({ types }: { types: AdminCustomerType[] }) {
  const { pending, error, run } = useRun();
  return (
    <Card>
      <CardHeader
        title="Profils clients"
        description="Proposés à l’inscription, dans cet ordre. Le tarif pro n’est appliqué qu’après validation si elle est demandée."
        action={
          <Dialog
            title="Nouveau profil"
            trigger={(open) => (
              <Button size="sm" onClick={open}>
                <Plus className="size-4" aria-hidden /> Nouveau profil
              </Button>
            )}
          >
            {(close) => <TypeForm onDone={close} />}
          </Dialog>
        }
      />
      {error ? (
        <div className="px-5 pt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      <ol className="divide-y divide-line">
        {types.map((t, i) => (
          <li
            key={t.id}
            className={cn(
              'flex flex-wrap items-start gap-4 px-5 py-4',
              !t.isActive && 'opacity-60',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                {t.label}
                <Badge tone={t.segment === 'pro' ? 'accent' : 'neutral'}>
                  Tarif {PRICE_SEGMENT_LABELS[t.segment].toLowerCase()}
                </Badge>
                {t.requiresReview ? <Badge tone="info">Validation par l’équipe</Badge> : null}
                {!t.isActive ? <Badge tone="danger">Désactivé</Badge> : null}
              </p>
              {t.description ? <p className="mt-1 text-sm text-muted">{t.description}</p> : null}
              <p className="text-xs text-muted">
                {t.customerCount} client{t.customerCount > 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <MoveButtons
                label={t.label}
                first={i === 0}
                last={i === types.length - 1}
                disabled={pending}
                onMove={(d) => run(() => moveTypeAction(t.id, d))}
              />
              <Dialog
                title={`Modifier « ${t.label} »`}
                trigger={(open) => (
                  <Button variant="secondary" size="sm" onClick={open}>
                    <Pencil className="size-3.5" aria-hidden /> Modifier
                  </Button>
                )}
              >
                {(close) => <TypeForm type={t} onDone={close} />}
              </Dialog>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function TypeForm({ type, onDone }: { type?: AdminCustomerType; onDone: () => void }) {
  const { pending, error, run } = useRun();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(
      () =>
        saveTypeAction(type?.id ?? null, {
          label: String(fd.get('label') ?? '').trim(),
          description: String(fd.get('description') ?? '').trim() || null,
          segment: String(fd.get('segment')) as PriceSegment,
          requiresReview: fd.get('requiresReview') === 'on',
          isActive: fd.get('isActive') === 'on',
        }),
      onDone,
    );
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextInput name="label" label="Nom du profil" required defaultValue={type?.label} />
      <TextArea
        name="description"
        label="Description (facultatif)"
        hint="Affichée sous le nom dans l’app, à l’inscription."
        maxLength={200}
        defaultValue={type?.description ?? ''}
      />
      <SelectInput
        name="segment"
        label="Tarif"
        options={Object.entries(PRICE_SEGMENT_LABELS)}
        defaultValue={type?.segment ?? 'retail'}
      />
      <Checkbox
        name="requiresReview"
        label="Validation par l’équipe"
        hint="Coché : le client garde le tarif particulier jusqu’à ce que l’équipe valide son profil (page Clients)."
        defaultChecked={type?.requiresReview ?? false}
      />
      <Checkbox
        name="isActive"
        label="Profil actif"
        hint="Décoché : plus proposé à l’inscription. Les clients qui l’ont déjà le gardent."
        defaultChecked={type?.isActive ?? true}
      />
      {type && type.customerCount > 0 ? (
        <p className="text-xs text-muted">
          Changer le tarif ne modifie pas les {type.customerCount} client
          {type.customerCount > 1 ? 's' : ''} déjà rattaché{type.customerCount > 1 ? 's' : ''} :
          leur tarif se change un par un depuis leur fiche (page Clients).
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Fermer
        </Button>
        <Button type="submit" loading={pending}>
          {type ? 'Enregistrer' : 'Créer le profil'}
        </Button>
      </div>
    </form>
  );
}
