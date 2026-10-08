import { AdminTotpSetupResponse } from '@afrisime/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { AuthShell } from '@/components/auth-shell';
import { Alert } from '@/components/ui/card';
import { ApiError, api } from '@/lib/api';
import { getChallenge } from '@/lib/session';
import { TotpForm } from '../forms';

export const metadata: Metadata = { title: 'Activer la vérification en deux étapes' };

/** Groupes de 4 caractères pour la saisie manuelle. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

export default async function SetupTotpPage() {
  const challenge = await getChallenge();
  if (challenge?.kind !== 'totp_setup') redirect('/login?etape=expiree');

  let setup: AdminTotpSetupResponse;
  try {
    setup = await api('/v1/admin/auth/totp/setup', {
      method: 'POST',
      body: { challengeId: challenge.id },
      schema: AdminTotpSetupResponse,
      auth: false,
    });
  } catch (error) {
    if (error instanceof ApiError && (error.code === 'OTP_EXPIRED' || error.code === 'OTP_TOO_MANY_ATTEMPTS')) {
      redirect('/login?etape=expiree');
    }
    throw error;
  }
  const qr = await QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 220, color: { dark: '#0f3d2e', light: '#ffffff' } });

  return (
    <AuthShell
      title="Sécurisez votre compte"
      subtitle="Votre rôle exige un code de vérification à chaque connexion, en plus du mot de passe."
    >
      <ol className="flex flex-col gap-6">
        <li>
          <p className="text-sm font-semibold text-ink">1. Installez une application d’authentification</p>
          <p className="mt-1 text-sm text-muted">Google Authenticator, Microsoft Authenticator ou équivalent, sur votre téléphone.</p>
        </li>
        <li>
          <p className="text-sm font-semibold text-ink">2. Scannez ce QR code avec l’application</p>
          <div className="mt-3 flex justify-center rounded-2xl border border-line bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- image générée (data URL), rien à optimiser */}
            <img src={qr} alt="QR code à scanner avec l’application d’authentification" width={220} height={220} />
          </div>
          <details className="mt-3 text-sm text-muted">
            <summary className="cursor-pointer font-medium text-brand-700">Impossible de scanner ? Saisir la clé à la main</summary>
            <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 font-mono text-[13px] tracking-wider break-all text-ink select-all">
              {grouped(setup.secret)}
            </p>
          </details>
        </li>
        <li>
          <p className="mb-3 text-sm font-semibold text-ink">3. Saisissez le code affiché par l’application</p>
          <TotpForm submitLabel="Activer et continuer" />
        </li>
      </ol>
      <div className="mt-6">
        <Alert tone="info">Cette clé est personnelle : ne la partagez pas et ne la photographiez pas.</Alert>
      </div>
    </AuthShell>
  );
}
