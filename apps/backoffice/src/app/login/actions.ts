'use server';

import {
  AdminChangePasswordBody,
  AdminLoginBody,
  AdminLoginResponse,
  AdminProfile,
  AdminSession,
  TotpCode,
} from '@afrisime/shared';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ApiError, api } from '@/lib/api';
import { clearSession, getChallenge, setChallenge, setSession } from '@/lib/session';

export type FormState = {
  error?: string;
  fields?: Record<string, string>;
  values?: Record<string, string>;
};

const text = (fd: FormData, key: string) => String(fd.get(key) ?? '');

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? 'form')] ??= issue.message;
  return out;
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) {
    const left = (error.details as { attemptsLeft?: number } | undefined)?.attemptsLeft;
    return left !== undefined
      ? `${error.message} Encore ${left} essai${left > 1 ? 's' : ''}.`
      : error.message;
  }
  return 'Une erreur est survenue. Réessayez.';
}

/** Après une session ouverte : changement de mot de passe si provisoire, sinon tableau de bord. */
async function enter(session: AdminSession): Promise<never> {
  await setSession(session.token, session.expiresAt);
  redirect(session.admin.mustChangePassword ? '/mot-de-passe' : '/');
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = { email: text(fd, 'email') };
  const parsed = AdminLoginBody.safeParse({ email: values.email, password: text(fd, 'password') });
  if (!parsed.success) return { fields: fieldErrors(parsed.error), values };

  let res: AdminLoginResponse;
  try {
    res = await api('/v1/admin/auth/login', {
      method: 'POST',
      body: parsed.data,
      schema: AdminLoginResponse,
      auth: false,
    });
  } catch (error) {
    return { error: messageOf(error), values };
  }
  if (res.status === 'authenticated') return enter(res);
  await setChallenge({
    id: res.challengeId,
    kind: res.status === 'totp_required' ? 'totp' : 'totp_setup',
  });
  redirect(res.status === 'totp_required' ? '/login/code' : '/login/activer-2fa');
}

/** Code 2FA pendant la connexion, ou premier code pendant l'activation. */
export async function totpAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const challenge = await getChallenge();
  if (!challenge) redirect('/login?etape=expiree');
  const code = TotpCode.safeParse(text(fd, 'code').replace(/\s/g, ''));
  if (!code.success) return { fields: { code: code.error.issues[0]?.message ?? 'Code invalide' } };

  let session: AdminSession;
  try {
    session = await api(
      challenge.kind === 'totp' ? '/v1/admin/auth/totp' : '/v1/admin/auth/totp/confirm',
      {
        method: 'POST',
        body: { challengeId: challenge.id, code: code.data },
        schema: AdminSession,
        auth: false,
      },
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === 'OTP_EXPIRED' || error.code === 'OTP_TOO_MANY_ATTEMPTS')
    ) {
      redirect(`/login?etape=${error.code === 'OTP_EXPIRED' ? 'expiree' : 'bloquee'}`);
    }
    return { error: messageOf(error) };
  }
  return enter(session);
}

export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const confirm = text(fd, 'confirm');
  const parsed = AdminChangePasswordBody.safeParse({
    currentPassword: text(fd, 'currentPassword'),
    newPassword: text(fd, 'newPassword'),
  });
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  if (confirm !== parsed.data.newPassword)
    return { fields: { confirm: 'Les deux mots de passe ne correspondent pas' } };

  try {
    await api('/v1/admin/me/password', { method: 'POST', body: parsed.data, schema: AdminProfile });
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthenticated) redirect('/login?etape=expiree');
    if (
      error instanceof ApiError &&
      (error.details as { field?: string } | undefined)?.field === 'currentPassword'
    ) {
      return { fields: { currentPassword: error.message } };
    }
    return { error: messageOf(error) };
  }
  redirect('/?bienvenue=1');
}

export async function logoutAction() {
  try {
    await api('/v1/admin/auth/logout', { method: 'POST', schema: z.unknown() });
  } catch {
    // Session déjà expirée côté serveur : on efface quand même le cookie.
  }
  await clearSession();
  redirect('/login?deconnecte=1');
}
