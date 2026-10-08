'use client';

import { MEDIA_ACCEPTED_TYPES, MEDIA_MAX_BYTES } from '@afrisime/shared';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useRef, useState, useTransition } from 'react';
import type { ImageTarget, Result } from '@/app/(app)/catalogue/actions';
import { imageAction } from '@/app/(app)/catalogue/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Forme de l'aperçu : carré (produit, rayon), paysage (carte d'accueil) ou logo. */
type Shape = 'square' | 'wide' | 'logo';

type Props = {
  target: ImageTarget;
  /** Adresse affichable de la photo actuelle (null : aucune). */
  src: string | null;
  /** Sans photo : initiales sur une couleur, ou image par défaut (logo intégré à l'app). */
  fallback: { color: string; text: string } | { src: string };
  canEdit: boolean;
  size?: 'md' | 'lg';
  shape?: Shape;
  /** Explication sous les boutons (règles de la photo). */
  hint?: string;
  /** Texte du retrait (« l'app affichera… »). */
  removeMessage?: string;
};

const HINTS: Record<Shape, string> = {
  square: 'JPEG, PNG ou WebP, 5 Mo maximum. Recadrée en carré automatiquement.',
  wide: 'JPEG, PNG ou WebP, 5 Mo maximum. Recadrée au format de la carte (paysage).',
  logo: 'PNG à fond transparent conseillé, 5 Mo maximum. Jamais recadré.',
};

/**
 * Photo d'un produit, d'un rayon, d'une carte d'accueil ou logo : aperçu, ajout / remplacement, retrait.
 * Le serveur met à la bonne taille et compresse : une photo de téléphone convient très bien.
 */
export function ImageUploader({
  target,
  src,
  fallback,
  canEdit,
  size = 'lg',
  shape = 'square',
  hint,
  removeMessage,
}: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const finish = (res: Result) => {
    if (!res.ok) return setError(res.error);
    setError(null);
    router.refresh();
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(MEDIA_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
      return setError('Formats acceptés : JPEG, PNG ou WebP.');
    }
    if (file.size > MEDIA_MAX_BYTES) return setError('Photo trop lourde (5 Mo maximum).');
    const form = new FormData();
    form.set('file', file);
    start(async () => finish(await imageAction(target, form)));
  };

  const remove = () => {
    if (!window.confirm(removeMessage ?? 'Retirer la photo ?')) return;
    start(async () => finish(await imageAction(target, null)));
  };

  const box =
    shape === 'wide'
      ? 'aspect-[15/8] w-full max-w-md'
      : shape === 'logo'
        ? 'h-20 w-64 bg-brand-900 p-3'
        : size === 'lg'
          ? 'size-40'
          : 'size-24';
  const shown = src ?? ('src' in fallback ? fallback.src : null);

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-line',
          box,
          pending && 'opacity-60',
        )}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- image servie par l'API (déjà optimisée)
          <img
            src={shown}
            alt=""
            className={cn('size-full', shape === 'logo' ? 'object-contain' : 'object-cover')}
          />
        ) : 'text' in fallback ? (
          <div
            className="grid size-full place-items-center text-3xl font-extrabold text-white"
            style={{
              background: `linear-gradient(135deg, ${fallback.color}, ${fallback.color}cc)`,
            }}
          >
            {fallback.text}
          </div>
        ) : null}
        {pending ? (
          <span className="absolute inset-0 grid place-items-center bg-white/50 text-sm font-semibold text-ink">
            Envoi…
          </span>
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={MEDIA_ACCEPTED_TYPES.join(',')}
            className="sr-only"
            onChange={onFile}
            aria-label="Choisir une image"
            tabIndex={-1}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            loading={pending}
            onClick={() => input.current?.click()}
          >
            <ImagePlus className="size-3.5" aria-hidden />{' '}
            {src ? 'Remplacer' : shape === 'logo' ? 'Remplacer le logo' : 'Ajouter une photo'}
          </Button>
          {src ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger-50 hover:text-danger"
              disabled={pending}
              onClick={remove}
            >
              <Trash2 className="size-3.5" aria-hidden />{' '}
              {shape === 'logo' ? 'Revenir au logo d’origine' : 'Retirer'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted">{hint ?? HINTS[shape]}</p>
      )}
    </div>
  );
}
