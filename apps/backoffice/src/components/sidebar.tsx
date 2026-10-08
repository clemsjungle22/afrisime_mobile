'use client';

import {
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  ShoppingBag,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type Item = { href: string; label: string; icon: LucideIcon; soon?: boolean };

const ITEMS: Item[] = [
  { href: '/', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/commandes', label: 'Commandes', icon: ShoppingBag },
  { href: '/catalogue', label: 'Catalogue', icon: Package, soon: true },
  { href: '/clients', label: 'Clients', icon: Users, soon: true },
  { href: '/parametres', label: 'Paramètres', icon: Settings, soon: true },
];

function NavLinks({ compact }: { compact?: boolean }) {
  const pathname = usePathname();
  return (
    <ul className={cn('flex gap-1', compact ? 'flex-row' : 'flex-col')}>
      {ITEMS.map(({ href, label, icon: Icon, soon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        const content = (
          <>
            <Icon className="size-[18px] shrink-0" aria-hidden />
            <span className="whitespace-nowrap">{label}</span>
            {soon ? (
              <span
                className={cn(
                  'ml-auto rounded-full bg-white/10 px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase',
                  compact && 'hidden',
                )}
              >
                Bientôt
              </span>
            ) : null}
          </>
        );
        const base =
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors';
        return (
          <li key={href}>
            {soon ? (
              <span
                className={cn(base, 'cursor-not-allowed text-brand-200/50')}
                aria-disabled
                title="Disponible dans une prochaine étape"
              >
                {content}
              </span>
            ) : (
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  base,
                  active
                    ? 'bg-white text-brand-900'
                    : 'text-brand-100 hover:bg-white/10 hover:text-white',
                )}
              >
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Menu latéral (grand écran) ou barre horizontale (tablette, petit écran). */
export function Sidebar() {
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-brand-900 px-4 py-6 lg:flex">
        <Link
          href="/"
          className="mb-8 flex flex-col items-start gap-2 px-2"
          aria-label="AfriSime back-office, tableau de bord"
        >
          <span className="inline-flex rounded-xl bg-white px-3 py-2">
            <Image src="/logo.webp" alt="" width={145} height={38} priority />
          </span>
          <span className="pl-1 text-xs font-semibold tracking-[0.18em] text-accent-500 uppercase">
            Back-office
          </span>
        </Link>
        <nav aria-label="Navigation principale">
          <NavLinks />
        </nav>
      </aside>
      <nav
        aria-label="Navigation principale"
        className="overflow-x-auto bg-brand-900 px-3 py-2 lg:hidden"
      >
        <NavLinks compact />
      </nav>
    </>
  );
}
