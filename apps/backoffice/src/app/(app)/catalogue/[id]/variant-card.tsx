'use client';

import {
  type AdminStockMovement,
  type AdminVariant,
  SALE_MODE_LABELS,
  STOCK_REASON_LABELS,
} from '@afrisime/shared';
import { History, Pencil, Plus, Tag, TrendingDown, Warehouse } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/form';
import { fromLocalInput, toLocalInput } from '@/lib/catalog';
import { cn, formatDateTime, formatFCFA } from '@/lib/utils';
import { type Result, movementsAction, variantAction } from '../actions';
import { VariantDialogForm } from '../product-forms';

type Agency = { id: string; name: string };

const AVAILABILITY: Record<
  AdminVariant['availability'],
  { label: string; tone: 'success' | 'info' | 'danger' | 'neutral' }
> = {
  available: { label: 'Disponible', tone: 'success' },
  on_order: { label: 'Sur commande', tone: 'info' },
  unavailable: { label: 'Rupture', tone: 'danger' },
  quote_only: { label: 'Sur devis', tone: 'neutral' },
};

const PRICE_STATE = {
  current: 'En vigueur',
  scheduled: 'Programmé',
  expired: 'Terminé',
  replaced: 'Remplacé',
} as const;

/** Envoie une opération et affiche l'erreur ; ferme la fenêtre et rafraîchit la page si tout va bien. */
function useOperation(onDone: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (call: () => Promise<Result<unknown>>) =>
    start(async () => {
      const res = await call();
      if (!res.ok) return setError(res.error);
      setError(null);
      router.refresh();
      onDone();
    });
  return { error, pending, run, setError };
}

const value = (e: FormEvent<HTMLFormElement>, name: string) =>
  String(new FormData(e.currentTarget).get(name) ?? '').trim();
const money = (raw: string) => Number(raw.replace(/\s/g, ''));

export function VariantCard({
  productId,
  variant: v,
  agencies,
  canEdit,
}: {
  productId: string;
  variant: AdminVariant;
  agencies: Agency[];
  canEdit: boolean;
}) {
  const availability = AVAILABILITY[v.availability];
  const priced = v.saleMode !== 'quote_only';
  return (
    <Card className={cn(!v.isActive && 'opacity-70')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-ink">{v.label}</h3>
            <Badge tone={availability.tone}>{availability.label}</Badge>
            {v.isPro ? <Badge tone="accent">Pro</Badge> : null}
            {!v.isActive ? <Badge tone="danger">Désactivé</Badge> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {v.sku} · {v.packaging} · {SALE_MODE_LABELS[v.saleMode]}
            {v.leadTimeDays ? ` (${v.leadTimeDays} j)` : ''}
            {v.minQuantity > 1 ? ` · minimum ${v.minQuantity}` : ''}
          </p>
        </div>
        {canEdit ? (
          <Dialog
            title={`Modifier « ${v.label} »`}
            trigger={(open) => (
              <Button variant="secondary" size="sm" onClick={open}>
                <Pencil className="size-3.5" aria-hidden /> Modifier
              </Button>
            )}
          >
            {(close) => (
              <VariantDialogForm
                productId={productId}
                variant={v}
                agencies={agencies}
                onDone={close}
              />
            )}
          </Dialog>
        ) : null}
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2">
        <section aria-label="Prix">
          <h4 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">Prix</h4>
          {priced ? (
            <>
              <dl className="grid grid-cols-3 gap-3">
                <PriceTile label="Public" value={v.current.retail} />
                <PriceTile
                  label="Pro"
                  value={v.current.pro}
                  hint={v.current.pro === null ? 'Prix public' : undefined}
                />
                <PriceTile
                  label="Promo"
                  value={v.current.promo?.amount ?? null}
                  hint={
                    v.current.promo
                      ? `au lieu de ${formatFCFA(v.current.promo.compareAt)}${v.current.promo.endsAt ? `, jusqu’au ${formatDateTime(v.current.promo.endsAt)}` : ', sans date de fin'}`
                      : 'Aucune'
                  }
                  accent
                />
              </dl>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <PriceDialog productId={productId} variant={v} />
                  <PromoDialog productId={productId} variant={v} />
                  {v.current.promo ? (
                    <EndButton
                      productId={productId}
                      variantId={v.id}
                      priceId={v.current.promo.id}
                      label="Arrêter la promo"
                    />
                  ) : null}
                </div>
              ) : null}
              <PriceHistory productId={productId} variant={v} canEdit={canEdit} />
            </>
          ) : (
            <p className="text-sm text-muted">Vendu sur devis : pas de prix catalogue.</p>
          )}
        </section>

        <section aria-label="Stock">
          <h4 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Stock par agence
          </h4>
          {v.saleMode === 'standard' ? (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="pb-2 font-semibold">
                      Agence
                    </th>
                    <th
                      scope="col"
                      className="pb-2 pl-3 text-right font-semibold whitespace-nowrap"
                    >
                      En stock
                    </th>
                    <th
                      scope="col"
                      className="pb-2 pl-3 text-right font-semibold whitespace-nowrap"
                    >
                      Réservé
                    </th>
                    <th
                      scope="col"
                      className="pb-2 pl-3 text-right font-semibold whitespace-nowrap"
                    >
                      Vendable
                    </th>
                    <th
                      scope="col"
                      className="pb-2 pl-3 text-right font-semibold whitespace-nowrap"
                    >
                      Seuil
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {v.stock.map((st) => (
                    <tr key={st.agencyId}>
                      <td className="py-2 font-semibold text-ink">{st.agencyName}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{st.onHand}</td>
                      <td className="py-2 pl-3 text-right text-muted tabular-nums">
                        {st.reserved}
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-bold tabular-nums',
                          st.sellable <= st.lowThreshold ? 'text-danger' : 'text-ink',
                        )}
                      >
                        {st.sellable}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums">
                        {canEdit ? (
                          <ThresholdEditor
                            productId={productId}
                            variantId={v.id}
                            agencyId={st.agencyId}
                            value={st.lowThreshold}
                          />
                        ) : (
                          st.lowThreshold
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex flex-wrap gap-2">
                {canEdit ? (
                  <StockDialog productId={productId} variant={v} agencies={agencies} />
                ) : null}
                <MovementsDialog variant={v} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              {v.saleMode === 'on_order'
                ? 'Commandé auprès du fournisseur à chaque vente : pas de stock suivi.'
                : 'Sur devis : pas de stock suivi.'}
            </p>
          )}
        </section>
      </div>
    </Card>
  );
}

function PriceTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | null;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2.5',
        accent && value !== null ? 'bg-accent-100' : 'bg-canvas',
      )}
    >
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 text-base font-extrabold whitespace-nowrap text-ink tabular-nums xl:text-lg">
        {value === null ? '—' : formatFCFA(value)}
      </dd>
      {hint ? <dd className="text-[11px] leading-tight text-muted">{hint}</dd> : null}
    </div>
  );
}

function PriceDialog({ productId, variant }: { productId: string; variant: AdminVariant }) {
  return (
    <Dialog
      title="Changer un prix"
      description="L’ancien prix reste dans l’historique. Sans date, le nouveau prix s’applique immédiatement."
      trigger={(open) => (
        <Button variant="secondary" size="sm" onClick={open}>
          <Tag className="size-3.5" aria-hidden /> Changer le prix
        </Button>
      )}
    >
      {(close) => <PriceForm productId={productId} variant={variant} onDone={close} />}
    </Dialog>
  );
}

function PriceForm({
  productId,
  variant,
  onDone,
}: {
  productId: string;
  variant: AdminVariant;
  onDone: () => void;
}) {
  const op = useOperation(onDone);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amount = money(value(e, 'amount'));
    const at = value(e, 'validFrom');
    if (!Number.isInteger(amount) || amount <= 0)
      return op.setError('Indiquez un prix entier en FCFA.');
    op.run(() =>
      variantAction(productId, variant.id, {
        kind: 'price',
        body: {
          segment: value(e, 'segment') as 'retail' | 'pro',
          amount,
          ...(at ? { validFrom: fromLocalInput(at) } : {}),
        },
      }),
    );
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {op.error ? <Alert tone="danger">{op.error}</Alert> : null}
      <SelectInput
        name="segment"
        label="Prix concerné"
        options={[
          ['retail', 'Prix public'],
          ['pro', 'Prix pro (clients validés)'],
        ]}
      />
      <TextInput
        name="amount"
        label="Nouveau prix"
        type="number"
        min={1}
        suffix="FCFA"
        required
        defaultValue={variant.current.retail ?? ''}
      />
      <TextInput
        name="validFrom"
        label="À partir du (facultatif)"
        type="datetime-local"
        min={toLocalInput(new Date())}
        hint="Heure de Lomé. Vide : immédiatement."
      />
      <Actions pending={op.pending} onCancel={onDone} label="Enregistrer le prix" />
    </form>
  );
}

function PromoDialog({ productId, variant }: { productId: string; variant: AdminVariant }) {
  return (
    <Dialog
      title="Programmer une promotion"
      description="Le prix public actuel s’affichera barré. La promotion apparaît dans les ventes flash de l’accueil."
      trigger={(open) => (
        <Button variant="accent" size="sm" onClick={open}>
          <TrendingDown className="size-3.5" aria-hidden /> Promotion
        </Button>
      )}
    >
      {(close) => <PromoForm productId={productId} variant={variant} onDone={close} />}
    </Dialog>
  );
}

function PromoForm({
  productId,
  variant,
  onDone,
}: {
  productId: string;
  variant: AdminVariant;
  onDone: () => void;
}) {
  const op = useOperation(onDone);
  const now = new Date();
  const inAWeek = new Date(now.getTime() + 7 * 86_400_000);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amount = money(value(e, 'amount'));
    if (!Number.isInteger(amount) || amount <= 0)
      return op.setError('Indiquez un prix entier en FCFA.');
    op.run(() =>
      variantAction(productId, variant.id, {
        kind: 'promo',
        body: {
          amount,
          startsAt: fromLocalInput(value(e, 'startsAt')),
          endsAt: fromLocalInput(value(e, 'endsAt')),
        },
      }),
    );
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {op.error ? <Alert tone="danger">{op.error}</Alert> : null}
      <TextInput
        name="amount"
        label="Prix promo"
        type="number"
        min={1}
        suffix="FCFA"
        required
        hint={
          variant.current.promo
            ? `Prix normal : ${formatFCFA(variant.current.promo.compareAt)} (une promotion est déjà en cours)`
            : variant.current.retail
              ? `Prix public actuel : ${formatFCFA(variant.current.retail)}`
              : undefined
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput
          name="startsAt"
          label="Début"
          type="datetime-local"
          required
          defaultValue={toLocalInput(now)}
        />
        <TextInput
          name="endsAt"
          label="Fin"
          type="datetime-local"
          required
          defaultValue={toLocalInput(inAWeek)}
        />
      </div>
      <Actions pending={op.pending} onCancel={onDone} label="Programmer la promotion" />
    </form>
  );
}

function EndButton({
  productId,
  variantId,
  priceId,
  label,
}: {
  productId: string;
  variantId: string;
  priceId: number;
  label: string;
}) {
  const op = useOperation(() => {});
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-danger hover:bg-danger-50 hover:text-danger"
        loading={op.pending}
        onClick={() => {
          if (window.confirm(`${label} ?`))
            op.run(() => variantAction(productId, variantId, { kind: 'end-price', priceId }));
        }}
      >
        {label}
      </Button>
      {op.error ? (
        <span role="alert" className="text-sm text-danger">
          {op.error}
        </span>
      ) : null}
    </>
  );
}

function PriceHistory({
  productId,
  variant,
  canEdit,
}: {
  productId: string;
  variant: AdminVariant;
  canEdit: boolean;
}) {
  if (variant.prices.length === 0) return null;
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer font-semibold text-brand-700">
        Historique des prix ({variant.prices.length})
      </summary>
      <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
        {variant.prices.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div>
              <p className="font-semibold text-ink">
                {p.segment === 'pro' ? 'Pro' : 'Public'} {p.kind === 'promo' ? 'promo' : ''} ·{' '}
                {formatFCFA(p.amount)}
                {p.compareAtAmount ? (
                  <span className="ml-1 text-muted line-through">
                    {formatFCFA(p.compareAtAmount)}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted">
                Du {formatDateTime(p.validFrom)}
                {p.validTo ? ` au ${formatDateTime(p.validTo)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                tone={
                  p.state === 'current' ? 'success' : p.state === 'scheduled' ? 'info' : 'neutral'
                }
              >
                {PRICE_STATE[p.state]}
              </Badge>
              {canEdit && p.state === 'scheduled' ? (
                <EndButton
                  productId={productId}
                  variantId={variant.id}
                  priceId={p.id}
                  label="Annuler"
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function StockDialog({
  productId,
  variant,
  agencies,
}: {
  productId: string;
  variant: AdminVariant;
  agencies: Agency[];
}) {
  return (
    <Dialog
      title="Mouvement de stock"
      description="Chaque mouvement est enregistré avec son motif dans l’historique."
      trigger={(open) => (
        <Button variant="secondary" size="sm" onClick={open}>
          <Warehouse className="size-3.5" aria-hidden /> Mouvement de stock
        </Button>
      )}
    >
      {(close) => (
        <StockForm productId={productId} variant={variant} agencies={agencies} onDone={close} />
      )}
    </Dialog>
  );
}

const KINDS = [
  ['add:reception', 'Réception de marchandise (+)'],
  ['add:return', 'Retour client (+)'],
  ['remove:loss', 'Casse / perte (−)'],
  ['set:inventory', 'Inventaire : stock compté (=)'],
  ['add:correction', 'Correction (+)'],
  ['remove:correction', 'Correction (−)'],
] as const;

function StockForm({
  productId,
  variant,
  agencies,
  onDone,
}: {
  productId: string;
  variant: AdminVariant;
  agencies: Agency[];
  onDone: () => void;
}) {
  const op = useOperation(onDone);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const [kind, reason] = value(e, 'kind').split(':') as [
      'add' | 'remove' | 'set',
      'reception' | 'return' | 'loss' | 'inventory' | 'correction',
    ];
    const quantity = Number(value(e, 'quantity'));
    if (!Number.isInteger(quantity) || quantity < 0)
      return op.setError('Indiquez une quantité entière.');
    const note = value(e, 'note');
    op.run(() =>
      variantAction(productId, variant.id, {
        kind: 'stock',
        body: { agencyId: value(e, 'agencyId'), kind, reason, quantity, ...(note ? { note } : {}) },
      }),
    );
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {op.error ? <Alert tone="danger">{op.error}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput
          name="agencyId"
          label="Agence"
          options={agencies.map((a) => [a.id, a.name] as const)}
        />
        <SelectInput name="kind" label="Motif" options={KINDS} />
      </div>
      <TextInput
        name="quantity"
        label="Quantité"
        type="number"
        min={0}
        required
        hint="Pour un inventaire : la quantité comptée en rayon."
      />
      <TextInput
        name="note"
        label="Note (facultatif)"
        placeholder="Ex. bon de livraison n° 1234"
        maxLength={200}
      />
      <Actions pending={op.pending} onCancel={onDone} label="Enregistrer le mouvement" />
    </form>
  );
}

function ThresholdEditor({
  productId,
  variantId,
  agencyId,
  value: initial,
}: {
  productId: string;
  variantId: string;
  agencyId: string;
  value: number;
}) {
  const op = useOperation(() => {});
  return (
    <form
      className="inline-flex"
      onSubmit={(e) => {
        e.preventDefault();
        const lowThreshold = Number(value(e, 'lowThreshold'));
        if (Number.isInteger(lowThreshold) && lowThreshold >= 0 && lowThreshold !== initial) {
          op.run(() =>
            variantAction(productId, variantId, {
              kind: 'threshold',
              body: { agencyId, lowThreshold },
            }),
          );
        }
      }}
    >
      <label className="sr-only" htmlFor={`thr-${variantId}-${agencyId}`}>
        Seuil d’alerte
      </label>
      <input
        id={`thr-${variantId}-${agencyId}`}
        name="lowThreshold"
        type="number"
        min={0}
        defaultValue={initial}
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(
          'h-8 w-16 rounded-lg border border-line px-2 text-right text-sm tabular-nums focus:border-brand-600 focus:outline-none',
          op.pending && 'opacity-50',
        )}
        title={op.error ?? 'Seuil d’alerte (tableau de bord)'}
      />
    </form>
  );
}

function MovementsDialog({ variant }: { variant: AdminVariant }) {
  const [rows, setRows] = useState<AdminStockMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setRows(null);
    const res = await movementsAction(variant.id);
    if (res.ok) setRows(res.data);
    else setError(res.error);
  };
  return (
    <Dialog
      wide
      title={`Mouvements de stock · ${variant.label}`}
      trigger={(open) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void load();
            open();
          }}
        >
          <History className="size-3.5" aria-hidden /> Historique
        </Button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {rows === null && !error ? <p className="text-sm text-muted">Chargement…</p> : null}
          {rows && rows.length === 0 ? (
            <p className="text-sm text-muted">Aucun mouvement enregistré.</p>
          ) : null}
          {rows && rows.length > 0 ? (
            <div className="max-h-[60dvh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-2 font-semibold">
                      Date
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Agence
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      Motif
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Mouvement
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Stock après
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 text-muted">{formatDateTime(m.at)}</td>
                      <td className="py-2">{m.agencyName}</td>
                      <td className="py-2">
                        <p className="font-semibold text-ink">{STOCK_REASON_LABELS[m.reason]}</p>
                        <p className="text-xs text-muted">
                          {m.actor}
                          {m.note ? ` · ${m.note}` : ''}
                        </p>
                      </td>
                      <td
                        className={cn(
                          'py-2 text-right font-bold tabular-nums',
                          m.delta > 0 ? 'text-brand-700' : 'text-danger',
                        )}
                      >
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </td>
                      <td className="py-2 pl-3 text-right tabular-nums">{m.onHandAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button variant="ghost" onClick={close}>
              Fermer
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Actions({
  pending,
  onCancel,
  label,
}: {
  pending: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="ghost" onClick={onCancel}>
        Fermer
      </Button>
      <Button type="submit" loading={pending}>
        {label}
      </Button>
    </div>
  );
}

/** Bouton « Ajouter un format » et sa fenêtre (côté navigateur). */
export function AddVariantButton({
  productId,
  agencies,
}: {
  productId: string;
  agencies: Agency[];
}) {
  return (
    <Dialog
      title="Ajouter un format"
      trigger={(open) => (
        <Button size="sm" onClick={open}>
          <Plus className="size-4" aria-hidden /> Ajouter un format
        </Button>
      )}
    >
      {(close) => <VariantDialogForm productId={productId} agencies={agencies} onDone={close} />}
    </Dialog>
  );
}
