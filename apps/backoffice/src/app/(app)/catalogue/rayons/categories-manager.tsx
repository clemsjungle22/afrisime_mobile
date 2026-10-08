'use client';

import { type AdminCategory, CATEGORY_COLORS } from '@afrisime/shared';
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, TextArea, TextInput } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { moveCategoryAction, saveCategoryAction } from '../actions';

export function CategoriesManager({
  categories,
  canEdit,
}: {
  categories: AdminCategory[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const move = (id: string, direction: 'up' | 'down') =>
    start(async () => {
      const res = await moveCategoryAction(id, direction);
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <div className="flex justify-end">
          <Dialog
            title="Nouveau rayon"
            trigger={(open) => (
              <Button onClick={open}>
                <Plus className="size-4" aria-hidden /> Nouveau rayon
              </Button>
            )}
          >
            {(close) => <CategoryForm onDone={close} />}
          </Dialog>
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Card className="overflow-hidden">
        <ol className="divide-y divide-line">
          {categories.map((c, i) => (
            <li
              key={c.id}
              className={cn(
                'flex flex-wrap items-center gap-4 px-5 py-3.5',
                !c.isActive && 'opacity-60',
              )}
            >
              <span
                className="size-9 shrink-0 rounded-xl"
                style={{ background: c.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">
                  {c.name}{' '}
                  {!c.isActive ? (
                    <Badge tone="danger" className="ml-1">
                      Désactivé
                    </Badge>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted">
                  {c.productCount} produit{c.productCount > 1 ? 's' : ''}
                  {c.description ? ` · ${c.description}` : ''}
                </p>
              </div>
              {canEdit ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Monter ${c.name}`}
                    disabled={i === 0 || pending}
                    onClick={() => move(c.id, 'up')}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Descendre ${c.name}`}
                    disabled={i === categories.length - 1 || pending}
                    onClick={() => move(c.id, 'down')}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Dialog
                    title={`Modifier « ${c.name} »`}
                    trigger={(open) => (
                      <Button variant="secondary" size="sm" onClick={open}>
                        <Pencil className="size-3.5" aria-hidden /> Modifier
                      </Button>
                    )}
                  >
                    {(close) => <CategoryForm category={c} onDone={close} />}
                  </Dialog>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function CategoryForm({ category, onDone }: { category?: AdminCategory; onDone: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [color, setColor] = useState<string>(category?.color ?? CATEGORY_COLORS[0]);
  const [pending, start] = useTransition();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const description = String(fd.get('description') ?? '').trim();
    start(async () => {
      const res = await saveCategoryAction(category?.id ?? null, {
        name: String(fd.get('name') ?? '').trim(),
        description: description || null,
        color,
        isActive: fd.get('isActive') === 'on',
      });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <TextInput name="name" label="Nom du rayon" required defaultValue={category?.name} />
      <TextArea
        name="description"
        label="Description (facultatif)"
        defaultValue={category?.description ?? ''}
        maxLength={300}
      />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Couleur</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Couleur ${c}`}
              aria-pressed={color === c}
              className={cn(
                'size-9 cursor-pointer rounded-xl ring-offset-2 transition',
                color === c ? 'ring-3 ring-ink' : 'hover:scale-105',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </fieldset>
      <Checkbox
        name="isActive"
        label="Rayon actif"
        hint="Décoché : le rayon et ses produits disparaissent de l’app."
        defaultChecked={category?.isActive ?? true}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Fermer
        </Button>
        <Button type="submit" loading={pending}>
          {category ? 'Enregistrer' : 'Créer le rayon'}
        </Button>
      </div>
    </form>
  );
}
