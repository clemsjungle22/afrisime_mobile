'use client';

import type { AdminDeliverySettings, AdminZone } from '@afrisime/shared';
import { Pencil, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, TextArea, TextInput } from '@/components/ui/form';
import { cn, formatFCFA } from '@/lib/utils';
import { moveZoneAction, saveRulesAction, saveZoneAction } from './actions';
import { MoveButtons, toInt, useRun } from './settings-ui';

export function DeliverySettings({ settings }: { settings: AdminDeliverySettings }) {
  return (
    <div className="flex flex-col gap-6">
      <ZonesCard zones={settings.zones} />
      <RulesCard rules={settings.rules} />
    </div>
  );
}

function ZonesCard({ zones }: { zones: AdminZone[] }) {
  const { pending, error, run } = useRun();
  return (
    <Card>
      <CardHeader
        title="Zones de livraison"
        description="Une adresse est livrée si son quartier figure dans une zone active. Les adresses déjà enregistrées gardent leur zone."
        action={
          <Dialog
            title="Nouvelle zone"
            trigger={(open) => (
              <Button size="sm" onClick={open}>
                <Plus className="size-4" aria-hidden /> Nouvelle zone
              </Button>
            )}
          >
            {(close) => <ZoneForm onDone={close} />}
          </Dialog>
        }
      />
      {error ? (
        <div className="px-5 pt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      <ol className="divide-y divide-line">
        {zones.map((z, i) => (
          <li
            key={z.id}
            className={cn(
              'flex flex-wrap items-start gap-4 px-5 py-4',
              !z.isActive && 'opacity-60',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                {z.name}
                <span className="font-semibold text-brand-700 tabular-nums">
                  {formatFCFA(z.fee)}
                </span>
                {z.cashOnDelivery ? <Badge tone="neutral">Paiement à la livraison</Badge> : null}
                {!z.isActive ? <Badge tone="danger">Désactivée</Badge> : null}
              </p>
              <p className="mt-1 text-sm text-muted">{z.districts.join(' · ')}</p>
              <p className="text-xs text-muted">
                {z.city} · {z.addressCount} adresse{z.addressCount > 1 ? 's' : ''} de clients
              </p>
            </div>
            <div className="flex items-center gap-1">
              <MoveButtons
                label={z.name}
                first={i === 0}
                last={i === zones.length - 1}
                disabled={pending}
                onMove={(d) => run(() => moveZoneAction(z.id, d))}
              />
              <Dialog
                title={`Modifier « ${z.name} »`}
                trigger={(open) => (
                  <Button variant="secondary" size="sm" onClick={open}>
                    <Pencil className="size-3.5" aria-hidden /> Modifier
                  </Button>
                )}
              >
                {(close) => <ZoneForm zone={z} onDone={close} />}
              </Dialog>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ZoneForm({ zone, onDone }: { zone?: AdminZone; onDone: () => void }) {
  const { pending, error, run } = useRun();
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const districts = String(fd.get('districts') ?? '')
      .split(/[\n,;]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    run(
      () =>
        saveZoneAction(zone?.id ?? null, {
          name: String(fd.get('name') ?? '').trim(),
          city: String(fd.get('city') ?? '').trim(),
          fee: toInt(fd.get('fee')),
          cashOnDelivery: fd.get('cashOnDelivery') === 'on',
          districts,
          isActive: fd.get('isActive') === 'on',
        }),
      onDone,
    );
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput name="name" label="Nom" required defaultValue={zone?.name} />
        <TextInput name="city" label="Ville" required defaultValue={zone?.city ?? 'Lomé'} />
      </div>
      <TextInput
        name="fee"
        label="Frais de livraison"
        type="number"
        min={0}
        suffix="FCFA"
        required
        defaultValue={zone?.fee ?? 1000}
      />
      <TextArea
        name="districts"
        label="Quartiers couverts"
        hint="Un par ligne (ou séparés par des virgules). Majuscules et accents ne comptent pas."
        rows={5}
        required
        defaultValue={zone?.districts.join('\n')}
      />
      <Checkbox
        name="cashOnDelivery"
        label="Paiement à la livraison autorisé"
        defaultChecked={zone?.cashOnDelivery ?? false}
      />
      <Checkbox
        name="isActive"
        label="Zone active"
        hint="Décoché : ces quartiers ne sont plus livrés (retrait en agence seulement)."
        defaultChecked={zone?.isActive ?? true}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Fermer
        </Button>
        <Button type="submit" loading={pending}>
          {zone ? 'Enregistrer' : 'Créer la zone'}
        </Button>
      </div>
    </form>
  );
}

function RulesCard({ rules }: { rules: AdminDeliverySettings['rules'] }) {
  const { pending, error, run } = useRun();
  const [saved, setSaved] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaved(false);
    run(
      () =>
        saveRulesAction({
          freeAbove: toInt(fd.get('freeAbove')),
          minOrder: toInt(fd.get('minOrder')),
          cashOnDeliveryMax: toInt(fd.get('cashOnDeliveryMax')),
          leadTimeMinutes: toInt(fd.get('leadTimeMinutes')),
          mobileMoneyBonus: toInt(fd.get('mobileMoneyBonus')),
          kycThreshold: toInt(fd.get('kycThreshold')),
        }),
      () => setSaved(true),
    );
  };
  return (
    <Card>
      <CardHeader title="Règles de commande" description="S’appliquent à toutes les zones." />
      <form onSubmit={submit} onChange={() => setSaved(false)} className="flex flex-col gap-4 p-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {saved ? (
          <Alert tone="success">Enregistré. Appliqué aux prochaines commandes.</Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            name="freeAbove"
            label="Livraison offerte à partir de"
            type="number"
            min={0}
            suffix="FCFA"
            required
            defaultValue={rules.freeAbove}
          />
          <TextInput
            name="minOrder"
            label="Minimum de commande pour être livré"
            type="number"
            min={0}
            suffix="FCFA"
            required
            defaultValue={rules.minOrder}
          />
          <TextInput
            name="cashOnDeliveryMax"
            label="Plafond du paiement à la livraison"
            type="number"
            min={0}
            suffix="FCFA"
            required
            defaultValue={rules.cashOnDeliveryMax}
          />
          <TextInput
            name="leadTimeMinutes"
            label="Délai minimum avant un créneau"
            type="number"
            min={0}
            suffix="min"
            required
            hint="Temps de préparation : un créneau qui commence plus tôt n’est pas proposé."
            defaultValue={rules.leadTimeMinutes}
          />
          <TextInput
            name="mobileMoneyBonus"
            label="Bonus paiement Mobile Money"
            type="number"
            min={0}
            suffix="FCFA"
            required
            hint="Déduit des frais de livraison quand le client paie par Mixx ou Flooz (0 : aucun bonus)."
            defaultValue={rules.mobileMoneyBonus}
          />
          <TextInput
            name="kycThreshold"
            label="Seuil de vérification d’identité"
            type="number"
            min={0}
            suffix="FCFA"
            required
            hint="Achats sur 30 jours au-delà desquels le client doit envoyer sa pièce d’identité (0 : jamais)."
            defaultValue={rules.kycThreshold}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            Enregistrer les règles
          </Button>
        </div>
      </form>
    </Card>
  );
}
