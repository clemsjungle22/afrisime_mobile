import { Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/auth-shell';
import { getChallenge } from '@/lib/session';
import { TotpForm } from '../forms';

export const metadata: Metadata = { title: 'Code de vérification' };

export default async function CodePage() {
  const challenge = await getChallenge();
  if (challenge?.kind !== 'totp') redirect('/login?etape=expiree');
  return (
    <AuthShell
      title="Code de vérification"
      subtitle="Ouvrez votre application d’authentification et saisissez le code affiché pour AfriSime."
    >
      <div className="mb-6 flex items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
        <Smartphone className="size-5 shrink-0" aria-hidden />
        Le code change toutes les 30 secondes.
      </div>
      <TotpForm submitLabel="Valider" />
    </AuthShell>
  );
}
