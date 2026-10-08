import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Champs de formulaire compatibles react-hook-form (`{...register('nom')}`) :
 * libellé, aide et erreur reliés au champ pour les lecteurs d'écran.
 */

const control =
  'rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand-600 focus:ring-3 focus:ring-brand-200 focus:outline-none disabled:bg-canvas disabled:text-muted';

function Wrapper({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Common = { label: string; hint?: string; error?: string; wrapperClassName?: string };

const described = (id: string, hint?: string, error?: string) =>
  [hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
  undefined;

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & Common & { name: string; suffix?: string }
>(function TextInput(
  { label, hint, error, wrapperClassName, className, id, name, suffix, ...props },
  ref,
) {
  const inputId = id ?? name;
  return (
    <Wrapper id={inputId} label={label} hint={hint} error={error} className={wrapperClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={described(inputId, hint, error)}
          className={cn(
            control,
            'h-11 w-full',
            suffix && 'pr-12',
            error && 'border-danger',
            className,
          )}
          {...props}
        />
        {suffix ? (
          <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm text-muted">
            {suffix}
          </span>
        ) : null}
      </div>
    </Wrapper>
  );
});

export const SelectInput = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> &
    Common & { name: string; options: readonly (readonly [string, string])[] }
>(function SelectInput(
  { label, hint, error, wrapperClassName, className, id, name, options, ...props },
  ref,
) {
  const inputId = id ?? name;
  return (
    <Wrapper id={inputId} label={label} hint={hint} error={error} className={wrapperClassName}>
      <select
        ref={ref}
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(inputId, hint, error)}
        className={cn(control, 'h-11', error && 'border-danger', className)}
        {...props}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Wrapper>
  );
});

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & Common & { name: string }
>(function TextArea({ label, hint, error, wrapperClassName, className, id, name, ...props }, ref) {
  const inputId = id ?? name;
  return (
    <Wrapper id={inputId} label={label} hint={hint} error={error} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={inputId}
        name={name}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={described(inputId, hint, error)}
        className={cn(control, 'py-2.5', error && 'border-danger', className)}
        {...props}
      />
    </Wrapper>
  );
});

export const Checkbox = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string }
>(function Checkbox({ label, hint, id, name, className, ...props }, ref) {
  const inputId = id ?? name;
  return (
    <label
      htmlFor={inputId}
      className={cn('flex cursor-pointer items-start gap-2.5 text-sm', className)}
    >
      <input
        ref={ref}
        id={inputId}
        name={name}
        type="checkbox"
        className="mt-0.5 size-4 accent-brand-700"
        {...props}
      />
      <span>
        <span className="font-semibold text-ink">{label}</span>
        {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
});
