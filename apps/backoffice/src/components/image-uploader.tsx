'use client';

import { MEDIA_ACCEPTED_TYPES, MEDIA_MAX_BYTES } from '@afrisime/shared';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useRef, useState, useTransition } from 'react';
import type { Result } from '@/app/(app)/catalogue/actions';
import { imageAction } from '@/app/(app)/catalogue/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  target: { kind: 'product' | 'category'; id: string };
  /** Adresse affichable de la photo actuelle (null : aucune). */
  src: string | null;
  /** Ce qui s'affiche sans photo (initiales sur la couleur du rayon). */
  fallback: { color: string; text: string };
  canEdit: boolean;
  size?: 'md' | 'lg';
};

/**
 * Photo d'un produit ou d'un rayon : aperçu, ajout / remplacement, retrait.
 * Le serveur recadre en carré et compresse : une photo de téléphone convient très bien.
 */
export function ImageUploader({ target, src, fallback, canEdit, size = 'lg' }: Props) {
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
    if (
      !window.confirm(
        'Retirer la photo ? L’app affichera de nouveau ' +
          (target.kind === 'product' ? 'les initiales.' : 'la couleur du rayon.'),
      )
    )
      return;
    start(async () => finish(await imageAction(target, null)));
  };

  const box = size === 'lg' ? 'size-40' : 'size-24';
  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-line',
          box,
          pending && 'opacity-60',
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- photo servie par l'API (déjà optimisée)
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <div
            className="grid size-full place-items-center text-3xl font-extrabold text-white"
            style={{
              background: `linear-gradient(135deg, ${fallback.color}, ${fallback.color}cc)`,
            }}
          >
            {fallback.text}
          </div>
        )}
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
            aria-label="Choisir une photo"
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
            {src ? 'Remplacer la photo' : 'Ajouter une photo'}
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
              <Trash2 className="size-3.5" aria-hidden /> Retirer
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <p className="text-xs text-muted">
          JPEG, PNG ou WebP, 5 Mo maximum. Recadrée en carré automatiquement.
        </p>
      )}
    </div>
  );
}
