'use client';

import type { AdminPack, AdminPackFormat } from '@afrisime/shared';
import { Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { ImageUploader } from '@/components/image-uploader';
import { PhotoPicker } from '@/components/photo-picker';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, TextArea, TextInput } from '@/components/ui/form';
import { cn, formatFCFA } from '@/lib/utils';
import { imageAction } from '../catalogue/actions';
import { savePackAction } from './actions';

type Line = { variantId: string; quantity: number };

export function PacksManager({
  packs,
  srcs,
  formats,
  canEdit,
}: {
  packs: AdminPack[];
  /** Adresse affichable de la photo de chaque pack. */
  srcs: Record<string, string | null>;
  formats: AdminPackFormat[];
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Dialog
            title="Nouveau pack"
            wide
            trigger={(open) => (
              <Button onClick={open}>
                <Plus className="size-4" aria-hidden /> Nouveau pack
              </Button>
            )}
          >
            {(close) => <PackForm formats={formats} onDone={close} />}
          </Dialog>
        </div>
      ) : null}
      {packs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
          Aucun pack pour l’instant.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {packs.map((p) => {
            const saving = p.catalogValue !== null ? p.catalogValue - p.price : null;
            return (
              <Card
                key={p.id}
                className={cn('flex flex-col gap-4 p-5', !p.isActive && 'opacity-70')}
              >
                <div className="flex gap-4">
                  <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-50 text-brand-700">
                    {srcs[p.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- photo servie par l'API (déjà optimisée)
                      <img src={srcs[p.id] ?? ''} alt="" className="size-full object-cover" />
                    ) : (
                      <Gift className="size-8" aria-hidden />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
                      {p.name}
                      {!p.isActive ? <Badge tone="danger">Désactivé</Badge> : null}
                    </p>
                    <p className="text-sm text-ink">
                      <strong>{formatFCFA(p.price)}</strong> en {p.durationDays} jours ·{' '}
                      <strong>{formatFCFA(p.dailyAmount)}</strong> / jour
                    </p>
                    <p className="text-xs text-muted">
                      {p.catalogValue !== null
                        ? `Valeur au détail ${formatFCFA(p.catalogValue)}${saving !== null && saving > 0 ? ` · économie client ${formatFCFA(saving)}` : saving !== null && saving < 0 ? ' · ⚠ plus cher qu’au détail' : ''}`
                        : 'Un produit du pack n’a pas de prix public'}
                    </p>
                    <p className="text-xs text-muted">
                      {p.activeCarnets} carnet{p.activeCarnets > 1 ? 's' : ''} en cours ·{' '}
                      {p.totalCarnets} au total
                    </p>
                  </div>
                </div>
                <ul className="grid gap-1 text-sm text-ink sm:grid-cols-2">
                  {p.items.map((i) => (
                    <li key={i.variantId} className="truncate">
                      <span className="font-semibold tabular-nums">{i.quantity} ×</span>{' '}
                      {i.productName} · {i.variantLabel}
                    </li>
                  ))}
                </ul>
                {canEdit ? (
                  <div className="flex justify-end">
                    <Dialog
                      title={`Modifier « ${p.name} »`}
                      wide
                      trigger={(open) => (
                        <Button variant="secondary" size="sm" onClick={open}>
                          <Pencil className="size-3.5" aria-hidden /> Modifier
                        </Button>
                      )}
                    >
                      {(close) => (
                        <div className="flex flex-col gap-5">
                          <ImageUploader
                            target={{ kind: 'pack', id: p.id }}
                            src={srcs[p.id] ?? null}
                            fallback={{ color: '#14503b', text: '' }}
                            canEdit
                            size="md"
                            removeMessage="Retirer la photo ? L’app affichera l’illustration par défaut."
                          />
                          <PackForm pack={p} formats={formats} onDone={close} />
                        </div>
                      )}
                    </Dialog>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PackForm({
  pack,
  formats,
  onDone,
}: {
  pack?: AdminPack;
  formats: AdminPackFormat[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [lines, setLines] = useState<Line[]>(
    pack?.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) ?? [
      { variantId: formats[0]?.variantId ?? '', quantity: 1 },
    ],
  );
  const [price, setPrice] = useState(String(pack?.price ?? ''));
  const [days, setDays] = useState(String(pack?.durationDays ?? 30));

  const byId = new Map(formats.map((f) => [f.variantId, f]));
  const value = lines.reduce<number | null>((sum, l) => {
    const p = byId.get(l.variantId)?.price;
    return sum === null || p === null || p === undefined ? null : sum + p * l.quantity;
  }, 0);
  const priceN = Number(price) || 0;
  const daysN = Math.max(1, Number(days) || 1);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      setError(null);
      const res = await savePackAction(pack?.id ?? null, {
        name: String(fd.get('name') ?? '').trim(),
        description: String(fd.get('description') ?? '').trim() || null,
        price: priceN,
        durationDays: daysN,
        items: lines.filter((l) => l.variantId),
        isActive: fd.get('isActive') === 'on',
      });
      if (!res.ok) return setError(res.error);
      if (!pack && photo && res.data.id) {
        const form = new FormData();
        form.set('file', photo);
        const sent = await imageAction({ kind: 'pack', id: res.data.id }, form);
        if (!sent.ok)
          return setError(`Pack créé, mais la photo n’a pas pu être envoyée : ${sent.error}`);
      }
      router.refresh();
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {pack && pack.activeCarnets > 0 ? (
        <Alert tone="info">
          Les {pack.activeCarnets} carnet{pack.activeCarnets > 1 ? 's' : ''} en cours gardent le
          contenu et le prix du jour de leur souscription.
        </Alert>
      ) : null}
      <TextInput
        name="name"
        label="Nom du pack"
        required
        defaultValue={pack?.name}
        placeholder="Pack Famille Quinzaine"
      />
      {pack ? null : (
        <PhotoPicker file={photo} onChange={setPhoto} label="Photo du pack (facultatif)" />
      )}
      <TextArea
        name="description"
        label="Description (facultatif)"
        maxLength={400}
        defaultValue={pack?.description ?? ''}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-ink">Contenu</legend>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              aria-label={`Produit ${i + 1}`}
              value={l.variantId}
              onChange={(e) => setLine(i, { variantId: e.target.value })}
              className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
            >
              {formats.map((f) => (
                <option key={f.variantId} value={f.variantId}>
                  {f.label}
                  {f.price !== null ? ` — ${formatFCFA(f.price)}` : ' — sur devis'}
                </option>
              ))}
            </select>
            <input
              aria-label={`Quantité du produit ${i + 1}`}
              type="number"
              min={1}
              max={999}
              value={l.quantity}
              onChange={(e) =>
                setLine(i, { quantity: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })
              }
              className="h-10 w-20 rounded-xl border border-line px-3 text-sm tabular-nums focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Retirer le produit ${i + 1}`}
              disabled={lines.length === 1}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
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
          disabled={lines.length >= 30}
          onClick={() =>
            setLines((ls) => [...ls, { variantId: formats[0]?.variantId ?? '', quantity: 1 }])
          }
        >
          <Plus className="size-3.5" aria-hidden /> Ajouter un produit
        </Button>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          name="price"
          label="Prix du pack"
          type="number"
          min={100}
          suffix="FCFA"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <TextInput
          name="durationDays"
          label="Durée de cotisation"
          type="number"
          min={1}
          max={365}
          suffix="jours"
          required
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </div>
      <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
        Cotisation journalière : <strong>{formatFCFA(Math.ceil(priceN / daysN))}</strong>
        {value !== null ? (
          <>
            {' '}
            · valeur au détail aujourd’hui : <strong>{formatFCFA(value)}</strong>
            {priceN > 0 && value > priceN ? ` · économie client ${formatFCFA(value - priceN)}` : ''}
            {priceN > value ? ' · ⚠ le pack est plus cher qu’au détail' : ''}
          </>
        ) : (
          ' · un produit choisi n’a pas de prix public'
        )}
      </p>
      <Checkbox
        name="isActive"
        label="Pack proposé dans l’app"
        hint="Décoché : plus de nouvelle souscription. Les carnets en cours continuent."
        defaultChecked={pack?.isActive ?? true}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Fermer
        </Button>
        <Button type="submit" loading={pending}>
          {pack ? 'Enregistrer' : 'Créer le pack'}
        </Button>
      </div>
    </form>
  );
}
