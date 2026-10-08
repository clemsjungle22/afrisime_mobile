'use client';

import {
  ADMIN_ROLE_LABELS,
  AdminRole,
  type AdminTeamCredentials,
  type AdminTeamMember,
  ROLES_REQUIRING_TOTP,
} from '@afrisime/shared';
import { Copy, KeyRound, LockOpen, Plus, ShieldOff, UserCog } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/form';
import { cn, formatDateTime } from '@/lib/utils';
import {
  createMemberAction,
  resetPasswordAction,
  resetTotpAction,
  unlockMemberAction,
  updateMemberAction,
} from './actions';
import { useRun } from './settings-ui';

const ROLE_HINTS: Record<AdminRole, string> = {
  admin: 'Tout, y compris les paramètres et l’équipe. Double authentification obligatoire.',
  catalog: 'Produits, prix, stock, rayons, accueil de l’app.',
  orders: 'Traitement des commandes ; consultation des clients.',
  support: 'Clients (validation des pros), notes sur les commandes.',
  readonly: 'Consultation seulement.',
};

const ROLE_OPTIONS = AdminRole.options.map((r) => [r, ADMIN_ROLE_LABELS[r]] as const);

export function TeamSettings({ team }: { team: AdminTeamMember[] }) {
  const [credentials, setCredentials] = useState<AdminTeamCredentials | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {credentials ? (
        <PasswordNotice credentials={credentials} onClose={() => setCredentials(null)} />
      ) : null}
      <Card>
        <CardHeader
          title="Équipe"
          description="Comptes du back-office. Un mot de passe provisoire est demandé à changer à la première connexion."
          action={
            <Dialog
              title="Nouveau compte"
              trigger={(open) => (
                <Button size="sm" onClick={open}>
                  <Plus className="size-4" aria-hidden /> Nouveau compte
                </Button>
              )}
            >
              {(close) => (
                <CreateForm
                  onDone={(c) => {
                    setCredentials(c);
                    close();
                  }}
                  onCancel={close}
                />
              )}
            </Dialog>
          }
        />
        <ul className="divide-y divide-line">
          {team.map((m) => (
            <MemberRow key={m.id} member={m} onCredentials={setCredentials} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Mot de passe provisoire : affiché une seule fois, à transmettre à la personne. */
function PasswordNotice({
  credentials: { member, temporaryPassword },
  onClose,
}: {
  credentials: AdminTeamCredentials;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Alert tone="success">
      <div className="flex flex-col gap-2">
        <p>
          Mot de passe provisoire de <strong>{member.name}</strong> ({member.email}). Transmettez-le
          en main propre : <strong>il ne sera plus affiché</strong>.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-white px-3 py-1.5 text-base font-bold tracking-wider text-ink select-all">
            {temporaryPassword}
          </code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(temporaryPassword).then(() => setCopied(true))
            }
          >
            <Copy className="size-3.5" aria-hidden /> {copied ? 'Copié' : 'Copier'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            J’ai transmis le mot de passe
          </Button>
        </div>
        {ROLES_REQUIRING_TOTP.has(member.role) ? (
          <p className="text-xs">
            Administrateur : la double authentification sera configurée à sa première connexion
            (application Google Authenticator ou équivalent).
          </p>
        ) : null}
      </div>
    </Alert>
  );
}

function CreateForm({
  onDone,
  onCancel,
}: {
  onDone: (c: AdminTeamCredentials) => void;
  onCancel: () => void;
}) {
  const { pending, error, run } = useRun();
  const [role, setRole] = useState<AdminRole>('orders');
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(
      () =>
        createMemberAction({
          name: String(fd.get('name') ?? '').trim(),
          email: String(fd.get('email') ?? '').trim(),
          role,
        }),
      onDone,
    );
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextInput name="name" label="Nom" required autoComplete="off" />
      <TextInput name="email" label="E-mail" type="email" required autoComplete="off" />
      <SelectInput
        name="role"
        label="Rôle"
        options={ROLE_OPTIONS}
        value={role}
        onChange={(e) => setRole(e.target.value as AdminRole)}
        hint={ROLE_HINTS[role]}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" loading={pending}>
          Créer le compte
        </Button>
      </div>
    </form>
  );
}

function MemberRow({
  member: m,
  onCredentials,
}: {
  member: AdminTeamMember;
  onCredentials: (c: AdminTeamCredentials) => void;
}) {
  const { pending, error, run } = useRun();
  const disabled = m.status === 'disabled';
  const confirmRun = (message: string, call: () => void) => {
    if (window.confirm(message)) call();
  };
  return (
    <li className={cn('flex flex-col gap-3 px-5 py-4', disabled && 'bg-canvas/60')}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-bold text-ink">
            {m.name}
            {m.isSelf ? <Badge tone="neutral">Vous</Badge> : null}
            <Badge tone={m.role === 'admin' ? 'accent' : 'neutral'}>
              {ADMIN_ROLE_LABELS[m.role]}
            </Badge>
            {disabled ? <Badge tone="danger">Désactivé</Badge> : null}
            {m.lockedUntil ? <Badge tone="warning">Bloqué (trop d’essais)</Badge> : null}
            {m.mustChangePassword ? <Badge tone="info">Mot de passe provisoire</Badge> : null}
          </p>
          <p className="text-sm text-muted">{m.email}</p>
          <p className="text-xs text-muted">
            {m.lastLoginAt
              ? `Dernière connexion le ${formatDateTime(m.lastLoginAt)}`
              : 'Jamais connecté'}
            {m.totpEnabled ? ' · 2FA activée' : ''}
          </p>
        </div>
        {m.isSelf ? null : (
          <div className="flex flex-wrap items-center gap-1">
            {m.lockedUntil ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => unlockMemberAction(m.id))}
              >
                <LockOpen className="size-3.5" aria-hidden /> Débloquer
              </Button>
            ) : null}
            <Dialog
              title={`Rôle de ${m.name}`}
              trigger={(open) => (
                <Button variant="secondary" size="sm" onClick={open} disabled={disabled}>
                  <UserCog className="size-3.5" aria-hidden /> Rôle
                </Button>
              )}
            >
              {(close) => <RoleForm member={m} onDone={close} />}
            </Dialog>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || disabled}
              onClick={() =>
                confirmRun(
                  `Nouveau mot de passe provisoire pour ${m.name} ? L’ancien ne fonctionnera plus et la personne sera déconnectée.`,
                  () => run(() => resetPasswordAction(m.id), onCredentials),
                )
              }
            >
              <KeyRound className="size-3.5" aria-hidden /> Mot de passe
            </Button>
            {m.totpEnabled ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || disabled}
                onClick={() =>
                  confirmRun(
                    `Réinitialiser la double authentification de ${m.name} ? À utiliser si son téléphone est perdu : elle la reconfigurera à sa prochaine connexion.`,
                    () => run(() => resetTotpAction(m.id)),
                  )
                }
              >
                <ShieldOff className="size-3.5" aria-hidden /> 2FA
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              className={disabled ? '' : 'text-danger hover:bg-danger-50 hover:text-danger'}
              onClick={() =>
                confirmRun(
                  disabled
                    ? `Réactiver le compte de ${m.name} ?`
                    : `Désactiver le compte de ${m.name} ? La personne est déconnectée tout de suite et ne peut plus se connecter.`,
                  () =>
                    run(() =>
                      updateMemberAction(m.id, { status: disabled ? 'active' : 'disabled' }),
                    ),
                )
              }
            >
              {disabled ? 'Réactiver' : 'Désactiver'}
            </Button>
          </div>
        )}
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </li>
  );
}

function RoleForm({ member, onDone }: { member: AdminTeamMember; onDone: () => void }) {
  const { pending, error, run } = useRun();
  const [role, setRole] = useState<AdminRole>(member.role);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run(() => updateMemberAction(member.id, { role }), onDone);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <SelectInput
        name="role"
        label="Rôle"
        options={ROLE_OPTIONS}
        value={role}
        onChange={(e) => setRole(e.target.value as AdminRole)}
        hint={ROLE_HINTS[role]}
      />
      <p className="text-xs text-muted">
        La personne est déconnectée et retrouve ses nouveaux accès à sa prochaine connexion.
        {role === 'admin' && !member.totpEnabled
          ? ' Administrateur : la double authentification lui sera demandée.'
          : ''}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" loading={pending} disabled={role === member.role}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
