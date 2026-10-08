import { ADMIN_PASSWORD_MIN } from '@afrisime/shared';
import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { requireAdmin } from '@/lib/admin';
import { PasswordForm } from '../login/forms';

export const metadata: Metadata = { title: 'Mot de passe' };

export default async function PasswordPage() {
  const admin = await requireAdmin({ allowPendingPassword: true });
  return (
    <AuthShell
      title={admin.mustChangePassword ? 'Choisissez votre mot de passe' : 'Changer de mot de passe'}
      subtitle={
        admin.mustChangePassword
          ? `Bienvenue ${admin.name}. Remplacez le mot de passe provisoire avant de continuer.`
          : 'Vos autres sessions ouvertes seront fermées.'
      }
    >
      <PasswordForm minLength={ADMIN_PASSWORD_MIN} />
    </AuthShell>
  );
}
