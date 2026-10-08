'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { type FormState, changePasswordAction, loginAction, totpAction } from './actions';

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        autoFocus
        defaultValue={state.values?.email}
        error={state.fields?.email}
      />
      <Field
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fields?.password}
      />
      <Button type="submit" size="lg" loading={pending}>
        Se connecter
      </Button>
    </form>
  );
}

export function TotpForm({ submitLabel }: { submitLabel: string }) {
  const [state, action, pending] = useActionState(totpAction, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field
        label="Code à 6 chiffres"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={7}
        placeholder="123 456"
        required
        autoFocus
        className="text-center text-xl font-bold tracking-[0.4em]"
        error={state.fields?.code}
      />
      <Button type="submit" size="lg" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

export function PasswordForm({ minLength }: { minLength: number }) {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field
        label="Mot de passe actuel (ou provisoire)"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        error={state.fields?.currentPassword}
      />
      <Field
        label="Nouveau mot de passe"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={minLength}
        required
        hint={`Au moins ${minLength} caractères. Une phrase facile à retenir fonctionne très bien.`}
        error={state.fields?.newPassword}
      />
      <Field
        label="Confirmer le nouveau mot de passe"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        error={state.fields?.confirm}
      />
      <Button type="submit" size="lg" loading={pending}>
        Enregistrer le mot de passe
      </Button>
    </form>
  );
}
