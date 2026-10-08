'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fenêtre modale native (<dialog>) : focus piégé, Échap pour fermer, fond assombri.
 * Le contenu n'est monté qu'à l'ouverture : un formulaire repart vierge à chaque fois.
 * `children` reçoit `close` pour fermer après un enregistrement réussi.
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  wide,
}: {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: string;
  children: (close: () => void) => ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  const close = () => setOpen(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <dialog
        ref={ref}
        aria-label={title}
        onClose={close}
        className={cn(
          'm-auto max-h-[90dvh] rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl backdrop:bg-brand-950/40',
          wide ? 'w-[min(44rem,calc(100vw-2rem))]' : 'w-[min(32rem,calc(100vw-2rem))]',
        )}
      >
        {isOpen ? (
          <div className="flex flex-col gap-4 p-6">
            <div>
              <h2 className="text-lg font-extrabold">{title}</h2>
              {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
            </div>
            {children(close)}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
