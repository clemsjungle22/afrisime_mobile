'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type AdminCategory,
  type AdminProductDetail,
  AdminProductInput,
  AdminVariantInput,
  EDITORIAL_BADGE_LABELS,
  type EditorialBadge,
  SALE_MODE_LABELS,
} from '@afrisime/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type FieldErrors, type UseFormRegister, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Checkbox, SelectInput, TextArea, TextInput } from '@/components/ui/form';
import { PhotoPicker } from '@/components/photo-picker';
import { ORIGIN_LABELS } from '@/lib/catalog';
import {
  type Result,
  addVariantAction,
  createProductAction,
  imageAction,
  updateProductAction,
  variantAction,
} from './actions';

type Agency = { id: string; name: string };

const BADGES = Object.keys(EDITORIAL_BADGE_LABELS) as EditorialBadge[];

/** Nombre saisi (champ vide → null). */
const optionalNumber = z.preprocess(
  (v) => (v === '' || v === null || Number.isNaN(v) ? null : Number(v)),
  z.number().int().nullable(),
);

// ─── Champs produit ──────────────────────────────────────────────────────────

function ProductFields({
  register,
  errors,
  categories,
}: {
  register: UseFormRegister<AdminProductInput>;
  errors: FieldErrors<AdminProductInput>;
  categories: AdminCategory[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput
        label="Nom du produit"
        {...register('name')}
        error={errors.name?.message}
        wrapperClassName="sm:col-span-2"
        placeholder="Ex. Huile d’arachide"
      />
      <TextInput label="Marque" {...register('brand')} error={errors.brand?.message} />
      <SelectInput
        label="Origine"
        {...register('origin')}
        options={Object.entries(ORIGIN_LABELS)}
      />
      <SelectInput
        label="Rayon"
        {...register('categoryId')}
        error={errors.categoryId?.message}
        options={[
          ['', 'Choisir…'],
          ...categories.map((c) => [c.id, c.isActive ? c.name : `${c.name} (désactivé)`] as const),
        ]}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold text-ink">Badges</legend>
        <div className="flex flex-wrap gap-4">
          {BADGES.map((b) => (
            <Checkbox
              key={b}
              label={EDITORIAL_BADGE_LABELS[b]}
              value={b}
              {...register('badges')}
              id={`badge-${b}`}
            />
          ))}
        </div>
        <p className="text-xs text-muted">
          « Promo », « Rupture » et « Sur commande » s’affichent automatiquement.
        </p>
      </fieldset>
      <TextArea
        label="Description"
        {...register('description')}
        error={errors.description?.message}
        wrapperClassName="sm:col-span-2"
      />
      <Checkbox
        label="Produit actif"
        hint="Décoché : le produit disparaît de l’app (il reste dans les commandes passées)."
        {...register('isActive')}
        className="sm:col-span-2"
      />
    </div>
  );
}

// ─── Champs format ───────────────────────────────────────────────────────────

type VariantValues = z.input<typeof VariantForm>;
const VariantForm = z.object({
  label: z.string(),
  packaging: z.string(),
  saleMode: z.enum(['standard', 'on_order', 'quote_only']),
  leadTimeDays: optionalNumber,
  minQuantity: z.coerce.number(),
  isPro: z.boolean(),
  isActive: z.boolean(),
});

function VariantFields({
  register,
  errors,
  saleMode,
}: {
  register: UseFormRegister<VariantValues>;
  errors: FieldErrors<VariantValues>;
  saleMode: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput
        label="Format"
        placeholder="Ex. Sac 25 kg"
        {...register('label')}
        error={errors.label?.message}
      />
      <TextInput
        label="Conditionnement"
        placeholder="Ex. sac, bidon, carton"
        {...register('packaging')}
        error={errors.packaging?.message}
      />
      <SelectInput
        label="Mode de vente"
        {...register('saleMode')}
        options={Object.entries(SALE_MODE_LABELS)}
      />
      {saleMode === 'on_order' ? (
        <TextInput
          label="Délai (jours)"
          type="number"
          min={1}
          {...register('leadTimeDays')}
          error={errors.leadTimeDays?.message}
        />
      ) : (
        <TextInput
          label="Quantité minimale"
          type="number"
          min={1}
          {...register('minQuantity')}
          error={errors.minQuantity?.message}
        />
      )}
      <Checkbox
        label="Format pro"
        hint="Grands conditionnements (revendeurs, restaurants)."
        {...register('isPro')}
      />
      <Checkbox label="Format actif" {...register('isActive')} />
    </div>
  );
}

/** Applique une erreur renvoyée par le serveur au champ concerné, sinon en message global. */
function useServerError() {
  const [error, setError] = useState<string | null>(null);
  return {
    error,
    setError,
    apply: (res: Result<unknown>) => (res.ok ? setError(null) : setError(res.error)),
  };
}

// ─── Création ────────────────────────────────────────────────────────────────

const CreateForm = z.object({
  product: AdminProductInput,
  variant: VariantForm,
  price: optionalNumber,
  stock: z.record(z.string(), optionalNumber),
});
type CreateValues = z.input<typeof CreateForm>;

export function ProductCreateForm({
  categories,
  agencies,
}: {
  categories: AdminCategory[];
  agencies: Agency[];
}) {
  const router = useRouter();
  const { error, setError } = useServerError();
  const [photo, setPhoto] = useState<File | null>(null);
  const { register, handleSubmit, control, formState } = useForm<CreateValues>({
    resolver: zodResolver(CreateForm),
    defaultValues: {
      product: {
        name: '',
        brand: '',
        origin: 'local',
        categoryId: '',
        description: '',
        badges: [],
        isActive: true,
      },
      variant: {
        label: '',
        packaging: '',
        saleMode: 'standard',
        leadTimeDays: null,
        minQuantity: 1,
        isPro: false,
        isActive: true,
      },
      price: '' as unknown as null,
      stock: Object.fromEntries(agencies.map((a) => [a.id, ''])),
    },
  });
  const saleMode = useWatch({ control, name: 'variant.saleMode' });
  const errors = formState.errors;

  const submit = handleSubmit(async (values) => {
    const v = CreateForm.parse(values);
    const variant = AdminVariantInput.safeParse({
      ...v.variant,
      leadTimeDays: v.variant.saleMode === 'on_order' ? v.variant.leadTimeDays : null,
    });
    if (!variant.success) return setError(variant.error.issues[0]?.message ?? 'Format incomplet');
    const res = await createProductAction({
      product: v.product,
      first: {
        variant: variant.data,
        price: v.variant.saleMode === 'quote_only' ? null : v.price,
        initialStock: Object.entries(v.stock)
          .filter(([, q]) => q !== null && q > 0)
          .map(([agencyId, quantity]) => ({ agencyId, quantity: quantity ?? 0 })),
      },
    });
    if (!res.ok) return setError(res.error);
    // Photo choisie pendant la saisie : envoyée maintenant que le produit existe.
    if (photo) {
      const form = new FormData();
      form.set('file', photo);
      const sent = await imageAction({ kind: 'product', id: res.data.id }, form);
      if (!sent.ok) return router.push(`/catalogue/${res.data.id}?cree=1&photo=echec`);
    }
    router.push(`/catalogue/${res.data.id}?cree=1`);
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-4 text-base font-bold">Produit</h2>
        <ProductFields
          register={prefixRegister<AdminProductInput>(register, 'product')}
          errors={(errors.product ?? {}) as FieldErrors<AdminProductInput>}
          categories={categories}
        />
        <div className="mt-5 border-t border-line pt-5">
          <PhotoPicker file={photo} onChange={setPhoto} label="Photo du produit (facultatif)" />
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-1 text-base font-bold">Premier format</h2>
        <p className="mb-4 text-sm text-muted">
          D’autres formats pourront être ajoutés ensuite (ex. 5 kg, 25 kg, 50 kg).
        </p>
        <PrefixedVariantFields register={register} errors={errors} saleMode={saleMode} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {saleMode !== 'quote_only' ? (
            <TextInput
              label="Prix public"
              type="number"
              min={1}
              suffix="FCFA"
              {...register('price')}
              error={errors.price?.message}
            />
          ) : (
            <p className="text-sm text-muted sm:col-span-2">
              Format sur devis : pas de prix catalogue.
            </p>
          )}
        </div>
        {saleMode === 'standard' ? (
          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-ink">Stock de départ par agence</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {agencies.map((a) => (
                <TextInput
                  key={a.id}
                  label={a.name}
                  type="number"
                  min={0}
                  {...register(`stock.${a.id}`)}
                  placeholder="0"
                />
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          Créer le produit
        </Button>
      </div>
    </form>
  );
}

/**
 * Réutilise un groupe de champs (produit, format) dans un formulaire plus large :
 * « name » est enregistré sous « product.name », options comprises (sinon la valeur
 * irait à la racine du formulaire et la validation du groupe échouerait toujours).
 */
function prefixRegister<T extends Record<string, unknown>>(
  register: UseFormRegister<CreateValues>,
  prefix: 'product' | 'variant',
): UseFormRegister<T> {
  return ((name: string, options?: object) =>
    (register as unknown as (n: string, o?: object) => ReturnType<UseFormRegister<T>>)(
      `${prefix}.${name}`,
      options,
    )) as unknown as UseFormRegister<T>;
}

/** Champs format préfixés « variant. » dans le formulaire de création. */
function PrefixedVariantFields({
  register,
  errors,
  saleMode,
}: {
  register: UseFormRegister<CreateValues>;
  errors: FieldErrors<CreateValues>;
  saleMode: string;
}) {
  return (
    <VariantFields
      register={prefixRegister<VariantValues>(register, 'variant')}
      errors={(errors.variant ?? {}) as FieldErrors<VariantValues>}
      saleMode={saleMode}
    />
  );
}

// ─── Modification du produit ─────────────────────────────────────────────────

export function ProductEditForm({
  product,
  categories,
  disabled,
}: {
  product: AdminProductDetail;
  categories: AdminCategory[];
  disabled: boolean;
}) {
  const router = useRouter();
  const { error, setError } = useServerError();
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, formState } = useForm<AdminProductInput>({
    resolver: zodResolver(AdminProductInput),
    defaultValues: {
      name: product.name,
      brand: product.brand,
      origin: product.origin,
      categoryId: product.categoryId,
      description: product.description,
      badges: product.badges,
      isActive: product.isActive,
    },
  });
  const submit = handleSubmit(async (values) => {
    setSaved(false);
    const res = await updateProductAction(product.id, values);
    if (!res.ok) return setError(res.error);
    setError(null);
    setSaved(true);
    router.refresh();
  });
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {saved ? <Alert tone="success">Produit enregistré.</Alert> : null}
      <fieldset disabled={disabled} className="contents">
        <ProductFields register={register} errors={formState.errors} categories={categories} />
      </fieldset>
      {disabled ? null : (
        <div className="flex justify-end">
          <Button type="submit" loading={formState.isSubmitting} disabled={!formState.isDirty}>
            Enregistrer
          </Button>
        </div>
      )}
    </form>
  );
}

// ─── Format : ajout et modification (dans une fenêtre) ───────────────────────

const NewVariantForm = VariantForm.extend({
  price: optionalNumber,
  stock: z.record(z.string(), optionalNumber),
});
type NewVariantValues = z.input<typeof NewVariantForm>;

export function VariantDialogForm({
  productId,
  variant,
  agencies,
  onDone,
}: {
  productId: string;
  variant?: AdminProductDetail['variants'][number];
  agencies: Agency[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { error, setError } = useServerError();
  const { register, handleSubmit, control, formState } = useForm<NewVariantValues>({
    resolver: zodResolver(NewVariantForm),
    defaultValues: {
      label: variant?.label ?? '',
      packaging: variant?.packaging ?? '',
      saleMode: variant?.saleMode ?? 'standard',
      leadTimeDays: variant?.leadTimeDays ?? null,
      minQuantity: variant?.minQuantity ?? 1,
      isPro: variant?.isPro ?? false,
      isActive: variant?.isActive ?? true,
      price: '' as unknown as null,
      stock: Object.fromEntries(agencies.map((a) => [a.id, ''])),
    },
  });
  const saleMode = useWatch({ control, name: 'saleMode' });

  const submit = handleSubmit(async (values) => {
    const v = NewVariantForm.parse(values);
    const input = AdminVariantInput.safeParse({
      ...v,
      leadTimeDays: v.saleMode === 'on_order' ? v.leadTimeDays : null,
    });
    if (!input.success) return setError(input.error.issues[0]?.message ?? 'Format incomplet');
    const res = variant
      ? await variantAction(productId, variant.id, { kind: 'update', body: input.data })
      : await addVariantAction(productId, {
          variant: input.data,
          price: v.saleMode === 'quote_only' ? null : v.price,
          initialStock: Object.entries(v.stock)
            .filter(([, q]) => q !== null && q > 0)
            .map(([agencyId, quantity]) => ({ agencyId, quantity: quantity ?? 0 })),
        });
    if (!res.ok) return setError(res.error);
    router.refresh();
    onDone();
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <VariantFields
        register={register as unknown as UseFormRegister<VariantValues>}
        errors={formState.errors as FieldErrors<VariantValues>}
        saleMode={saleMode}
      />
      {!variant && saleMode !== 'quote_only' ? (
        <TextInput label="Prix public" type="number" min={1} suffix="FCFA" {...register('price')} />
      ) : null}
      {!variant && saleMode === 'standard' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {agencies.map((a) => (
            <TextInput
              key={a.id}
              label={`Stock ${a.name}`}
              type="number"
              min={0}
              placeholder="0"
              {...register(`stock.${a.id}`)}
            />
          ))}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Fermer
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          {variant ? 'Enregistrer' : 'Ajouter le format'}
        </Button>
      </div>
    </form>
  );
}
