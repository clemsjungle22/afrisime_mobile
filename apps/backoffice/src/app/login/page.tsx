import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/card';
import { LoginForm } from './forms';

export const metadata: Metadata = { title: 'Connexion' };

const NOTICES: Record<string, { tone: 'info' | 'warning'; text: string }> = {
  expiree: {
    tone: 'warning',
    text: 'Votre session ou l’étape de vérification a expiré. Reconnectez-vous.',
  },
  bloquee: { tone: 'warning', text: 'Trop d’essais de code. Reconnectez-vous pour recommencer.' },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const notice = params.etape
    ? NOTICES[params.etape]
    : params.deconnecte
      ? { tone: 'info' as const, text: 'Vous êtes déconnecté.' }
      : null;
  return (
    <AuthShell title="Connexion" subtitle="Accès réservé à l’équipe AfriSime.">
      <div className="flex flex-col gap-5">
        {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
        <LoginForm />
        <p className="text-sm text-muted">
          Mot de passe oublié ou compte bloqué ? Demandez à un administrateur de réinitialiser votre
          accès.
        </p>
      </div>
    </AuthShell>
  );
}
