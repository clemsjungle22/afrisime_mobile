import { ADMIN_ROLE_LABELS } from '@afrisime/shared';
import { KeyRound, LogOut } from 'lucide-react';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Badge } from '@/components/ui/card';
import { requireAdmin } from '@/lib/admin';
import { logoutAction } from '../login/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const initials = admin.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="lg:flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-end gap-3 border-b border-line bg-white/90 px-5 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800" aria-hidden>
              {initials}
            </span>
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-semibold text-ink">{admin.name}</p>
              <p className="text-xs text-muted">{admin.email}</p>
            </div>
            <Badge tone={admin.role === 'admin' ? 'accent' : 'neutral'}>{ADMIN_ROLE_LABELS[admin.role]}</Badge>
          </div>
          <span className="h-6 w-px bg-line" aria-hidden />
          <Link
            href="/mot-de-passe"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-brand-50 hover:text-ink"
          >
            <KeyRound className="size-4" aria-hidden />
            <span className="hidden md:inline">Mot de passe</span>
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-brand-50 hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden md:inline">Déconnexion</span>
            </button>
          </form>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
