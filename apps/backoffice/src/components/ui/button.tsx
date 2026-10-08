import { type VariantProps, cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-brand-900 text-white hover:bg-brand-800 active:bg-brand-950',
        accent: 'bg-accent-500 text-brand-950 hover:bg-accent-600',
        secondary: 'border border-line bg-white text-ink hover:bg-brand-50',
        ghost: 'text-muted hover:bg-brand-50 hover:text-ink',
        danger: 'bg-danger text-white hover:bg-danger/90',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean };

export function Button({ className, variant, size, loading, disabled, children, ...props }: Props) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
