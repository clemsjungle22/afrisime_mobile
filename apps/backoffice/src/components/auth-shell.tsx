import Image from 'next/image';
import type { ReactNode } from 'react';

/** Mise en page des écrans de connexion : panneau de marque à gauche (grand écran), formulaire à droite. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-900 via-brand-900 to-brand-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 28px), repeating-linear-gradient(-45deg, #fff 0 2px, transparent 2px 28px)',
          }}
        />
        <div className="relative">
          <span className="inline-flex rounded-2xl bg-white px-4 py-3">
            <Image src="/logo.webp" alt="AfriSime" width={168} height={44} priority />
          </span>
        </div>
        <div className="relative max-w-md">
          <p className="text-sm font-semibold tracking-[0.18em] text-accent-500 uppercase">Back-office</p>
          <h1 className="mt-3 text-4xl leading-tight font-extrabold tracking-tight">
            Catalogue, commandes et clients, au même endroit.
          </h1>
          <p className="mt-4 text-brand-200">
            Espace réservé à l’équipe AfriSime. Chaque action est enregistrée dans le journal d’audit.
          </p>
        </div>
        <p className="relative text-sm text-brand-200">Lomé · Togo</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image src="/logo.webp" alt="AfriSime" width={137} height={36} priority />
            <span className="text-xs font-semibold tracking-wider text-accent-600 uppercase">Back-office</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h2>
          {subtitle ? <div className="mt-2 text-[15px] text-muted">{subtitle}</div> : null}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
