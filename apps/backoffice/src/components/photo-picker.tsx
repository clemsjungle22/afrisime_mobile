'use client';

import { MEDIA_ACCEPTED_TYPES, MEDIA_MAX_BYTES } from '@afrisime/shared';
import { ImagePlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Choix d'une photo AVANT la création (produit, rayon, carte) : aperçu immédiat,
 * format et taille vérifiés ; la photo est envoyée juste après l'enregistrement.
 */
export function PhotoPicker({
  file,
  onChange,
  wide,
  label = 'Photo (facultatif)',
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  wide?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!(MEDIA_ACCEPTED_TYPES as readonly string[]).includes(f.type))
      return setError('Formats acceptés : JPEG, PNG ou WebP.');
    if (f.size > MEDIA_MAX_BYTES) return setError('Photo trop lourde (5 Mo maximum).');
    setError(null);
    onChange(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            'grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-line bg-canvas text-muted',
            wide ? 'aspect-[15/8] w-56' : 'size-24',
          )}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local avant envoi
            <img
              src={preview}
              alt="Aperçu de la photo choisie"
              className="size-full object-cover"
            />
          ) : (
            <ImagePlus className="size-6" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={input}
            type="file"
            accept={MEDIA_ACCEPTED_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choisir une photo"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => input.current?.click()}
            >
              <ImagePlus className="size-3.5" aria-hidden />{' '}
              {file ? 'Changer' : 'Choisir une photo'}
            </Button>
            {file ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
                <X className="size-3.5" aria-hidden /> Enlever
              </Button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : (
            <p className="text-xs text-muted">
              JPEG, PNG ou WebP, 5 Mo max.{' '}
              {wide ? 'Recadrée au format de la carte.' : 'Recadrée en carré.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
