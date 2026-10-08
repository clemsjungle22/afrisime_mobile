'use client';

import {
  HOME_BLOCK_LABELS,
  HomeBlock,
  type HomeAppearance,
  type HomeBlockText,
} from '@afrisime/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Checkbox, TextInput } from '@/components/ui/form';
import { saveSettingsAction } from './actions';

/** Phrase d'accueil et, pour chaque section, petit texte, titre et affichage. */
export function SettingsForm({
  appearance,
  canEdit,
}: {
  appearance: HomeAppearance;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [greeting, setGreeting] = useState(appearance.greetingSubtitle);
  const [blocks, setBlocks] = useState(appearance.blocks);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const setBlock = (key: HomeBlock, patch: Partial<HomeBlockText>) => {
    setBlocks((b) => ({ ...b, [key]: { ...b[key], ...patch } }));
    setMessage(null);
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    start(async () => {
      const res = await saveSettingsAction({ greetingSubtitle: greeting, blocks });
      setMessage(
        res.ok
          ? { ok: true, text: 'Enregistré. L’app sera à jour d’ici une minute.' }
          : { ok: false, text: res.error },
      );
      if (res.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <fieldset disabled={!canEdit} className="flex flex-col gap-5">
        <TextInput
          name="greetingSubtitle"
          label="Phrase sous « Bonjour »"
          required
          maxLength={80}
          value={greeting}
          onChange={(e) => {
            setGreeting(e.target.value);
            setMessage(null);
          }}
        />
        <div className="divide-y divide-line rounded-2xl border border-line">
          {HomeBlock.options.map((key) => {
            const block = blocks[key];
            return (
              <div key={key} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-ink">{HOME_BLOCK_LABELS[key]}</p>
                  <Checkbox
                    name={`${key}-visible`}
                    label="Afficher dans l’app"
                    checked={block.visible}
                    onChange={(e) => setBlock(key, { visible: e.target.checked })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                  <TextInput
                    name={`${key}-overline`}
                    label="Petit texte (au-dessus)"
                    maxLength={40}
                    value={block.overline}
                    onChange={(e) => setBlock(key, { overline: e.target.value })}
                  />
                  <TextInput
                    name={`${key}-title`}
                    label="Titre"
                    required
                    maxLength={60}
                    value={block.title}
                    onChange={(e) => setBlock(key, { title: e.target.value })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>
      <p className="text-xs text-muted">
        Une section sans produit à montrer reste cachée, même si « Afficher » est coché.
      </p>
      {message ? <Alert tone={message.ok ? 'success' : 'danger'}>{message.text}</Alert> : null}
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            Enregistrer les textes
          </Button>
        </div>
      ) : null}
    </form>
  );
}
