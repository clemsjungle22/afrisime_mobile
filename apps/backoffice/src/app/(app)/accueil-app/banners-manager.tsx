'use client';

import {
  type AdminBanner,
  BANNER_TONE_LABELS,
  type BannerState,
  BannerTone,
  DEFAULT_BANNER_EYEBROWS,
} from '@afrisime/shared';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState, useTransition } from 'react';
import { ImageUploader } from '@/components/image-uploader';
import { PhotoPicker } from '@/components/photo-picker';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, SelectInput, TextInput } from '@/components/ui/form';
import { fromLocalInput, toLocalInput } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import { imageAction } from '../catalogue/actions';
import { deleteBannerAction, moveBannerAction, saveBannerAction } from './actions';

type Choice = { slug: string; name: string };

/** Couleurs des cartes, identiques à l'app. */
const TONES: Record<
  BannerTone,
  {
    from: string;
    to: string;
    fg: string;
    muted: string;
    eyebrow: string;
    cta: string;
    ctaText: string;
  }
> = {
  brand: {
    from: '#14503b',
    to: '#0a2a20',
    fg: '#ffffff',
    muted: '#bfe0cf',
    eyebrow: '#e8a33d',
    cta: '#e8a33d',
    ctaText: '#0a2a20',
  },
  accent: {
    from: '#f2b955',
    to: '#c9811a',
    fg: '#0a2a20',
    muted: '#5b3a06',
    eyebrow: '#0f3d2e',
    cta: '#0f3d2e',
    ctaText: '#ffffff',
  },
  neutral: {
    from: '#2f6b2a',
    to: '#16391a',
    fg: '#ffffff',
    muted: '#cfe6c2',
    eyebrow: '#f6c978',
    cta: '#ffffff',
    ctaText: '#16391a',
  },
};

const STATES: Record<
  BannerState,
  { label: string; tone: 'success' | 'info' | 'neutral' | 'danger' }
> = {
  live: { label: 'En ligne', tone: 'success' },
  scheduled: { label: 'Programmée', tone: 'info' },
  ended: { label: 'Terminée', tone: 'neutral' },
  inactive: { label: 'Désactivée', tone: 'danger' },
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Africa/Lome',
});

/** Destinations possibles d'une carte (liens internes de l'app). */
function destinations(categories: Choice[], products: Choice[], current: string | null) {
  const list: [string, string][] = [
    ['', 'Aucune (la carte ne mène nulle part)'],
    ['/boutique', 'La boutique (tous les produits)'],
    ['/boutique?offer=promotion', 'Les promotions'],
    ['/boutique?offer=new', 'Les nouveautés'],
    ['/boutique?offer=pro', 'Les formats pro'],
    ...categories.map((c): [string, string] => [
      `/boutique?category=${c.slug}`,
      `Rayon : ${c.name}`,
    ]),
    ...products.map((p): [string, string] => [`/product/${p.slug}`, `Produit : ${p.name}`]),
  ];
  if (current && !list.some(([v]) => v === current))
    list.push([current, `Lien actuel : ${current}`]);
  return list;
}

/** Aperçu fidèle de la carte telle qu'elle apparaît dans l'app. */
export function BannerPreview({
  eyebrow,
  title,
  subtitle,
  ctaLabel,
  tone,
  src,
  className,
}: {
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  tone: BannerTone;
  src: string | null;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      className={cn(
        // Proportions de la carte de l'app (343 × 214) ; textes en cqw : aperçu fidèle à toute taille.
        '@container relative aspect-[343/214] w-full overflow-hidden rounded-[6.4%_/_10.3%] shadow-md',
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
    >
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- photo servie par l'API ou aperçu local */}
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(90deg, ${t.from} 0%, ${t.from}e6 45%, ${t.from}00 85%)`,
            }}
          />
        </>
      ) : (
        <div
          className="absolute top-[3cqw] -right-[9cqw] size-[55cqw] rounded-full bg-white/10"
          aria-hidden
        />
      )}
      <div className="relative flex h-full w-[66%] flex-col justify-center gap-[1.5cqw] px-[5.8cqw] py-[5.2cqw]">
        <p
          className="text-[3.2cqw] font-extrabold tracking-[0.14em] uppercase"
          style={{ color: t.eyebrow }}
        >
          {eyebrow || DEFAULT_BANNER_EYEBROWS[tone]}
        </p>
        <p
          className="line-clamp-3 text-[6.1cqw] leading-[7.6cqw] font-extrabold"
          style={{ color: t.fg }}
        >
          {title || 'Titre de la carte'}
        </p>
        {subtitle ? (
          <p className="line-clamp-2 text-[3.8cqw] leading-[5cqw]" style={{ color: t.muted }}>
            {subtitle}
          </p>
        ) : null}
        {ctaLabel ? (
          <span
            className="mt-[1.7cqw] w-fit rounded-full whitespace-nowrap px-[4.1cqw] py-[2.3cqw] text-[4.1cqw] leading-none font-bold"
            style={{ background: t.cta, color: t.ctaText }}
          >
            {ctaLabel} →
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function BannersManager({
  banners,
  srcs,
  categories,
  products,
  canEdit,
}: {
  banners: AdminBanner[];
  /** Adresse affichable de la photo de chaque carte. */
  srcs: Record<string, string | null>;
  categories: Choice[];
  products: Choice[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (call: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      const res = await call();
      setError(res.ok ? null : res.error);
      router.refresh();
    });
  const live = banners.filter((b) => b.state === 'live').length;

  const formProps = { categories, products };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {live} carte{live > 1 ? 's' : ''} en ligne sur {banners.length}.
        </p>
        {canEdit ? (
          <Dialog
            title="Nouvelle carte"
            wide
            trigger={(open) => (
              <Button onClick={open}>
                <Plus className="size-4" aria-hidden /> Nouvelle carte
              </Button>
            )}
          >
            {(close) => <BannerForm {...formProps} onDone={close} />}
          </Dialog>
        ) : null}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {banners.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-muted">
          Aucune carte : l’accueil de l’app commence directement par les rayons.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {banners.map((b, i) => {
            const state = STATES[b.state];
            return (
              <li
                key={b.id}
                className="flex flex-col gap-4 rounded-2xl border border-line p-4 sm:flex-row sm:items-center"
              >
                <BannerPreview
                  {...b}
                  src={srcs[b.id] ?? null}
                  className={cn('sm:w-72 sm:shrink-0', b.state !== 'live' && 'opacity-60')}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-muted">#{i + 1}</span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                    <Badge tone="neutral">{BANNER_TONE_LABELS[b.tone]}</Badge>
                  </div>
                  <p className="font-bold text-ink">{b.title}</p>
                  <p className="text-xs text-muted">
                    {b.link
                      ? `Mène vers : ${destinations(categories, products, b.link).find(([v]) => v === b.link)?.[1]}`
                      : 'Ne mène nulle part'}
                  </p>
                  {b.startsAt || b.endsAt ? (
                    <p className="text-xs text-muted">
                      {b.startsAt ? `Du ${dateFmt.format(new Date(b.startsAt))} ` : ''}
                      {b.endsAt
                        ? `${b.startsAt ? 'au' : 'Jusqu’au'} ${dateFmt.format(new Date(b.endsAt))}`
                        : ''}
                    </p>
                  ) : null}
                  {canEdit ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Monter « ${b.title} »`}
                        disabled={i === 0 || pending}
                        onClick={() => run(() => moveBannerAction(b.id, 'up'))}
                      >
                        <ArrowUp className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Descendre « ${b.title} »`}
                        disabled={i === banners.length - 1 || pending}
                        onClick={() => run(() => moveBannerAction(b.id, 'down'))}
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </Button>
                      <Dialog
                        title="Modifier la carte"
                        wide
                        trigger={(open) => (
                          <Button variant="secondary" size="sm" onClick={open}>
                            <Pencil className="size-3.5" aria-hidden /> Modifier
                          </Button>
                        )}
                      >
                        {(close) => (
                          <BannerForm
                            {...formProps}
                            banner={b}
                            src={srcs[b.id] ?? null}
                            onDone={close}
                          />
                        )}
                      </Dialog>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger-50 hover:text-danger"
                        disabled={pending}
                        onClick={() => {
                          if (
                            window.confirm(`Supprimer la carte « ${b.title} » ? C’est définitif.`)
                          )
                            run(() => deleteBannerAction(b.id));
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden /> Supprimer
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function BannerForm({
  banner,
  src,
  categories,
  products,
  onDone,
}: {
  banner?: AdminBanner;
  src?: string | null;
  categories: Choice[];
  products: Choice[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [eyebrow, setEyebrow] = useState(banner?.eyebrow ?? '');
  const [title, setTitle] = useState(banner?.title ?? '');
  const [subtitle, setSubtitle] = useState(banner?.subtitle ?? '');
  const [ctaLabel, setCtaLabel] = useState(banner?.ctaLabel ?? '');
  const [link, setLink] = useState(banner?.link ?? '');
  const [tone, setTone] = useState<BannerTone>(banner?.tone ?? 'brand');
  const [photo, setPhoto] = useState<File | null>(null);
  const local = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => (local ? URL.revokeObjectURL(local) : undefined), [local]);
  const options = useMemo(
    () => destinations(categories, products, banner?.link ?? null),
    [categories, products, banner?.link],
  );

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const startsAt = String(fd.get('startsAt') ?? '');
    const endsAt = String(fd.get('endsAt') ?? '');
    start(async () => {
      const res = await saveBannerAction(banner?.id ?? null, {
        eyebrow: eyebrow.trim() || null,
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        ctaLabel: ctaLabel.trim() || null,
        link: link || null,
        tone,
        isActive: fd.get('isActive') === 'on',
        startsAt: startsAt ? fromLocalInput(startsAt) : null,
        endsAt: endsAt ? fromLocalInput(endsAt) : null,
      });
      if (!res.ok) return setError(res.error);
      // Nouvelle carte : la photo choisie est envoyée maintenant qu'elle existe.
      if (!banner && photo && res.data.id) {
        const form = new FormData();
        form.set('file', photo);
        const sent = await imageAction({ kind: 'banner', id: res.data.id }, form);
        if (!sent.ok) {
          router.refresh();
          return setError(`Carte créée, mais la photo n’a pas pu être envoyée : ${sent.error}`);
        }
      }
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-ink">Aperçu dans l’app</p>
        <BannerPreview
          eyebrow={eyebrow.trim() || null}
          title={title}
          subtitle={subtitle.trim() || null}
          ctaLabel={ctaLabel.trim() || null}
          tone={tone}
          src={banner ? (src ?? null) : local}
          className="max-w-md"
        />
      </div>
      {banner ? (
        <ImageUploader
          target={{ kind: 'banner', id: banner.id }}
          src={src ?? null}
          fallback={{ color: TONES[tone].from, text: '' }}
          canEdit
          shape="wide"
          removeMessage="Retirer la photo ? La carte gardera son fond de couleur et son illustration."
        />
      ) : null}
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {banner ? null : (
          <PhotoPicker file={photo} onChange={setPhoto} wide label="Photo de fond (facultatif)" />
        )}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Style</legend>
          <div className="flex flex-wrap gap-2">
            {BannerTone.options.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tone === t}
                onClick={() => setTone(t)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                  tone === t ? 'border-ink ring-2 ring-ink' : 'border-line hover:border-muted',
                )}
              >
                <span
                  className="size-5 rounded-md"
                  style={{
                    background: `linear-gradient(135deg, ${TONES[t].from}, ${TONES[t].to})`,
                  }}
                  aria-hidden
                />
                {BANNER_TONE_LABELS[t]}
              </button>
            ))}
          </div>
        </fieldset>
        <TextInput
          name="eyebrow"
          label="Petit texte du haut (facultatif)"
          hint={`Vide : « ${DEFAULT_BANNER_EYEBROWS[tone]} ».`}
          maxLength={40}
          value={eyebrow}
          onChange={(e) => setEyebrow(e.target.value)}
        />
        <TextInput
          name="title"
          label="Titre"
          required
          minLength={2}
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextInput
          name="subtitle"
          label="Sous-titre (facultatif)"
          maxLength={140}
          value={subtitle}
          onChange={(e) => setSubtitle(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            name="ctaLabel"
            label="Texte du bouton (facultatif)"
            hint="Vide : pas de bouton."
            maxLength={30}
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
          />
          <SelectInput
            name="link"
            label="Destination"
            hint="Ce qui s’ouvre quand le client touche la carte."
            options={options}
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            name="startsAt"
            type="datetime-local"
            label="Début (facultatif)"
            hint="Heure de Lomé. Vide : tout de suite."
            defaultValue={banner?.startsAt ? toLocalInput(new Date(banner.startsAt)) : ''}
          />
          <TextInput
            name="endsAt"
            type="datetime-local"
            label="Fin (facultatif)"
            hint="Vide : sans date de fin."
            defaultValue={banner?.endsAt ? toLocalInput(new Date(banner.endsAt)) : ''}
          />
        </div>
        <Checkbox
          name="isActive"
          label="Carte active"
          hint="Décoché : la carte est retirée de l’app sans être supprimée."
          defaultChecked={banner?.isActive ?? true}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Fermer
          </Button>
          <Button type="submit" loading={pending}>
            {banner ? 'Enregistrer' : 'Créer la carte'}
          </Button>
        </div>
      </form>
    </div>
  );
}
