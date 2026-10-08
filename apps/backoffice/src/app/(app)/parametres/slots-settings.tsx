'use client';

import { type SlotConfig, type SlotWindow, WEEKDAY_LABELS } from '@afrisime/shared';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Card, CardHeader } from '@/components/ui/card';
import { TextInput } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { saveSlotsAction } from './actions';
import { useRun } from './settings-ui';

/** Lundi d'abord, comme un calendrier. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hour = (h: number) => `${h} h`;

export function SlotsSettings({ config }: { config: SlotConfig }) {
  const { pending, error, run } = useRun();
  const [delivery, setDelivery] = useState(config.delivery);
  const [pickup, setPickup] = useState(config.pickup);
  const [closed, setClosed] = useState(new Set(config.closedDays));
  const [daysAhead, setDaysAhead] = useState(config.daysAhead);
  const [capDelivery, setCapDelivery] = useState(config.capacity.delivery?.toString() ?? '');
  const [capPickup, setCapPickup] = useState(config.capacity.pickup?.toString() ?? '');
  const [saved, setSaved] = useState(false);
  const touch = () => setSaved(false);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cap = (v: string) => (v.trim() ? Math.max(1, Math.round(Number(v))) : null);
    run(
      () =>
        saveSlotsAction({
          delivery: [...delivery].sort((a, b) => a.from - b.from),
          pickup: [...pickup].sort((a, b) => a.from - b.from),
          closedDays: [...closed].sort(),
          daysAhead,
          capacity: { delivery: cap(capDelivery), pickup: cap(capPickup) },
        }),
      () => setSaved(true),
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? (
        <Alert tone="success">
          Enregistré. L’app propose les nouveaux créneaux dès maintenant.
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <WindowsCard
          title="Livraison"
          description="Plages proposées pour être livré."
          windows={delivery}
          onChange={(w) => {
            setDelivery(w);
            touch();
          }}
        />
        <WindowsCard
          title="Retrait en agence"
          description="Plages proposées pour venir chercher sa commande."
          windows={pickup}
          onChange={(w) => {
            setPickup(w);
            touch();
          }}
        />
      </div>

      <Card>
        <CardHeader
          title="Calendrier"
          description="Jours ouverts et nombre de jours proposés à l’avance."
        />
        <div className="flex flex-col gap-5 p-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">Jours ouverts</legend>
            <div className="flex flex-wrap gap-2">
              {WEEK.map((d) => {
                const open = !closed.has(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={open}
                    onClick={() => {
                      const next = new Set(closed);
                      if (open) next.add(d);
                      else next.delete(d);
                      setClosed(next);
                      touch();
                    }}
                    className={cn(
                      'cursor-pointer rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 transition-colors',
                      open
                        ? 'bg-brand-900 text-white ring-brand-900'
                        : 'bg-white text-muted ring-line line-through hover:text-ink',
                    )}
                  >
                    {WEEKDAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Barré : fermé, aucun créneau ce jour-là.</p>
          </fieldset>
          <TextInput
            name="daysAhead"
            label="Nombre de jours ouverts proposés"
            type="number"
            min={1}
            max={14}
            required
            wrapperClassName="max-w-xs"
            value={daysAhead}
            onChange={(e) => {
              setDaysAhead(Math.max(1, Math.min(14, Number(e.target.value) || 1)));
              touch();
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Capacité"
          description="Nombre maximum de commandes par créneau. Vide : sans limite. Un créneau plein apparaît « complet » dans l’app."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <TextInput
            name="capDelivery"
            label="Livraison : commandes par créneau et par zone"
            type="number"
            min={1}
            placeholder="Sans limite"
            value={capDelivery}
            onChange={(e) => {
              setCapDelivery(e.target.value);
              touch();
            }}
          />
          <TextInput
            name="capPickup"
            label="Retrait : commandes par créneau et par agence"
            type="number"
            min={1}
            placeholder="Sans limite"
            value={capPickup}
            onChange={(e) => {
              setCapPickup(e.target.value);
              touch();
            }}
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Enregistrer les créneaux
        </Button>
      </div>
    </form>
  );
}

function WindowsCard({
  title,
  description,
  windows,
  onChange,
}: {
  title: string;
  description: string;
  windows: SlotWindow[];
  onChange: (windows: SlotWindow[]) => void;
}) {
  const set = (i: number, patch: Partial<SlotWindow>) =>
    onChange(windows.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const last = windows.at(-1);
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="flex flex-col gap-3 p-5">
        {windows.map((w, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <HourSelect
              label={`${title} : début de la plage ${i + 1}`}
              value={w.from}
              hours={HOURS.slice(0, 24)}
              onChange={(from) => set(i, { from })}
            />
            <span className="text-sm text-muted">à</span>
            <HourSelect
              label={`${title} : fin de la plage ${i + 1}`}
              value={w.to}
              hours={HOURS.slice(1)}
              onChange={(to) => set(i, { to })}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Retirer la plage ${hour(w.from)}–${hour(w.to)}`}
              disabled={windows.length === 1}
              onClick={() => onChange(windows.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-fit"
          disabled={windows.length >= 8 || (last?.to ?? 0) >= 24}
          onClick={() => {
            const from = Math.min(23, last?.to ?? 8);
            onChange([...windows, { from, to: Math.min(24, from + 4) }]);
          }}
        >
          <Plus className="size-3.5" aria-hidden /> Ajouter une plage
        </Button>
      </div>
    </Card>
  );
}

function HourSelect({
  label,
  value,
  hours,
  onChange,
}: {
  label: string;
  value: number;
  hours: number[];
  onChange: (h: number) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
    >
      {hours.map((h) => (
        <option key={h} value={h}>
          {hour(h)}
        </option>
      ))}
    </select>
  );
}
