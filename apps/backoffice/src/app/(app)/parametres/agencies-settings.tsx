'use client';

import type { AdminAgency } from '@afrisime/shared';
import { Pencil, Plus, Star } from 'lucide-react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, TextInput } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { defaultAgencyAction, moveAgencyAction, saveAgencyAction } from './actions';
import { MoveButtons, useRun } from './settings-ui';

export function AgenciesSettings({ agencies }: { agencies: AdminAgency[] }) {
  const { pending, error, run } = useRun();
  return (
    <Card>
      <CardHeader
        title="Agences"
        description="Points de retrait et de stock. L’agence par défaut est celle des visiteurs et des nouveaux clients."
        action={
          <Dialog
            title="Nouvelle agence"
            trigger={(open) => (
              <Button size="sm" onClick={open}>
                <Plus className="size-4" aria-hidden /> Nouvelle agence
              </Button>
            )}
          >
            {(close) => <AgencyForm onDone={close} />}
          </Dialog>
        }
      />
      {error ? (
        <div className="px-5 pt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      <ol className="divide-y divide-line">
        {agencies.map((a, i) => (
          <li
            key={a.id}
            className={cn(
              'flex flex-wrap items-start gap-4 px-5 py-4',
              !a.isActive && 'opacity-60',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                {a.name}
                {a.isDefault ? <Badge tone="accent">Par défaut</Badge> : null}
                {!a.isActive ? <Badge tone="danger">Désactivée</Badge> : null}
              </p>
              <p className="mt-1 text-sm text-ink">
                {a.address}, {a.city}
                {a.phone ? ` · ${a.phone}` : ''}
              </p>
              <p className="text-xs text-muted">
                {a.openingHours ?? 'Horaires non renseignés'} · {a.customerCount} client
                {a.customerCount > 1 ? 's' : ''} rattaché{a.customerCount > 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {!a.isDefault && a.isActive ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => defaultAgencyAction(a.id))}
                >
                  <Star className="size-3.5" aria-hidden /> Par défaut
                </Button>
              ) : null}
              <MoveButtons
                label={a.name}
                first={i === 0}
                last={i === agencies.length - 1}
                disabled={pending}
                onMove={(d) => run(() => moveAgencyAction(a.id, d))}
              />
              <Dialog
                title={`Modifier « ${a.name} »`}
                trigger={(open) => (
                  <Button variant="secondary" size="sm" onClick={open}>
                    <Pencil className="size-3.5" aria-hidden /> Modifier
                  </Button>
                )}
              >
                {(close) => <AgencyForm agency={a} onDone={close} />}
              </Dialog>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function AgencyForm({ agency, onDone }: { agency?: AdminAgency; onDone: () => void }) {
  const { pending, error, run } = useRun();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const text = (k: string) => String(fd.get(k) ?? '').trim();
    run(
      () =>
        saveAgencyAction(agency?.id ?? null, {
          name: text('name'),
          city: text('city'),
          address: text('address'),
          phone: text('phone') || null,
          openingHours: text('openingHours') || null,
          isActive: fd.get('isActive') === 'on',
        }),
      onDone,
    );
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {agency ? null : (
        <Alert tone="info">
          La nouvelle agence démarre sans stock : ses produits apparaîtront en rupture jusqu’à ce
          que vous ajoutiez du stock depuis le Catalogue.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput name="name" label="Nom" required defaultValue={agency?.name} />
        <TextInput name="city" label="Ville" required defaultValue={agency?.city ?? 'Lomé'} />
      </div>
      <TextInput name="address" label="Adresse" required defaultValue={agency?.address} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          name="phone"
          label="Téléphone (facultatif)"
          type="tel"
          defaultValue={agency?.phone ?? ''}
        />
        <TextInput
          name="openingHours"
          label="Horaires (facultatif)"
          placeholder="Lun–Sam 8 h–19 h"
          defaultValue={agency?.openingHours ?? ''}
        />
      </div>
      <Checkbox
        name="isActive"
        label="Agence active"
        hint={
          agency?.isDefault
            ? 'Agence par défaut : choisissez-en une autre avant de la désactiver.'
            : 'Décoché : l’agence n’est plus proposée dans l’app (retrait, inscription).'
        }
        defaultChecked={agency?.isActive ?? true}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Fermer
        </Button>
        <Button type="submit" loading={pending}>
          {agency ? 'Enregistrer' : 'Créer l’agence'}
        </Button>
      </div>
    </form>
  );
}
